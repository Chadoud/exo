import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/local_store.dart';
import '../../sync/source_stop.dart';
import '../../sync/source_stop_flow.dart';
import '../../sync/task_source_forget.dart';
import 'source_stop_copy.dart';

/// Stop mail/calendar harvest from the phone after desktop advertises capability.
class SourceStopSection extends StatefulWidget {
  const SourceStopSection({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<SourceStopSection> createState() => _SourceStopSectionState();
}

class _SourceStopSectionState extends State<SourceStopSection> {
  bool _capable = false;
  final Map<String, SourceStopPhase> _phases = {};
  String? _busySource;
  int _seenEpoch = -1;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _reload();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch) _reload();
  }

  Future<void> _reload() async {
    _seenEpoch = widget.config.dataEpoch;
    final store = widget.config.localStore;
    final rows = await store.listByCollection(tasksCollection);
    var capable = false;
    final phases = <String, SourceStopPhase>{};
    for (final row in rows) {
      final id = row['record_id']?.toString() ?? '';
      if (id == sourceForgetCapabilityId &&
          !LocalBrainStore.rowIsPendingDelete(row)) {
        capable = true;
      }
      if (id.startsWith(sourceForgetPrefix)) {
        final source = id.substring(sourceForgetPrefix.length);
        if (forgettableTaskSources.contains(source)) {
          phases[source] = sourceStopPhaseFromRow(row);
        }
      }
    }
    capable = widget.config.isPaired && capable;
    if (!mounted) return;
    setState(() {
      _capable = capable;
      _phases
        ..clear()
        ..addAll(phases);
    });
  }

  Future<void> _confirmStop(String source) async {
    setState(() => _busySource = source);
    await confirmAndQueueSourceStop(
      context: context,
      config: widget.config,
      source: source,
    );
    if (mounted) setState(() => _busySource = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_capable) return const SizedBox.shrink();
    final copy = SourceStopCopy.of(context);
    final sources = forgettableTaskSources.toList()..sort();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ExoSectionLabel(copy.sectionTitle),
        const SizedBox(height: ExoSpacing.sm),
        ExoSurface(
          padding: const EdgeInsets.symmetric(vertical: ExoSpacing.sm),
          child: Column(
            children: [
              for (var i = 0; i < sources.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _SourceStopTile(
                  label: copy.sourceLabel(sources[i]),
                  phase: _phases[sources[i]] ?? SourceStopPhase.ready,
                  busy: _busySource == sources[i],
                  copy: copy,
                  onStop: () => _confirmStop(sources[i]),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: ExoSpacing.xl),
      ],
    );
  }
}

class _SourceStopTile extends StatelessWidget {
  const _SourceStopTile({
    required this.label,
    required this.phase,
    required this.busy,
    required this.copy,
    required this.onStop,
  });

  final String label;
  final SourceStopPhase phase;
  final bool busy;
  final SourceStopCopy copy;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final trailing = switch (phase) {
      SourceStopPhase.ready => TextButton(
          onPressed: busy ? null : onStop,
          child: Text(copy.stop),
        ),
      SourceStopPhase.waiting => Text(
          copy.waiting,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      SourceStopPhase.paused => Text(
          copy.paused,
          style: Theme.of(context).textTheme.bodySmall,
        ),
    };
    return ListTile(
      title: Text(label),
      trailing: busy
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : trailing,
    );
  }
}
