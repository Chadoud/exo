import 'dart:convert';

import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../layout/window_size.dart';
import '../../sync/sync_collection_scaffold.dart';
import '../../sync/sync_list_empty.dart';
import '../../sync/user_messages.dart';
import 'memory_list_tile.dart';
import 'memory_search_field.dart';

/// Memory tab — recent list + inline search (sync UI via [SyncCollectionScaffold]).
class MemoryScreen extends StatefulWidget {
  const MemoryScreen({
    super.key,
    required this.config,
    this.onSignInAgain,
    this.onPairAgain,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final _searchController = TextEditingController();

  /// Active query; null means browsing recent memories.
  String? _query;
  List<Map<String, dynamic>> _items = [];
  int? _selectedIndex;
  int _seenEpoch = -1;

  bool get _isSearch => _query != null && _query!.length >= 2;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _reload();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _searchController.dispose();
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch) {
      _reload();
    }
  }

  Future<void> _reload() async {
    _seenEpoch = widget.config.dataEpoch;
    final q = _query;
    final rows = (q == null || q.length < 2)
        ? await widget.config.localStore.listByCollection('memory_entries')
        : await widget.config.localStore.search(q);
    if (!mounted) return;
    setState(() {
      _items = rows;
      if (_selectedIndex != null && _selectedIndex! >= _items.length) {
        _selectedIndex = null;
      }
    });
  }

  Map<String, dynamic>? _payloadAt(int index) {
    if (index < 0 || index >= _items.length) return null;
    return jsonDecode(_items[index]['payload_json'] as String) as Map<String, dynamic>;
  }

  Future<void> _submitSearch() async {
    final q = _searchController.text.trim();
    setState(() {
      _query = q.length >= 2 ? q : null;
      _selectedIndex = null;
    });
    await _reload();
  }

  Future<void> _clearSearch() async {
    _searchController.clear();
    setState(() {
      _query = null;
      _selectedIndex = null;
    });
    await _reload();
  }

  void _openDetail(int index) {
    if (exoUseNavigationRail(context)) {
      setState(() => _selectedIndex = index);
      return;
    }
    final payload = _payloadAt(index);
    if (payload == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _MemoryDetailPage(payload: payload)),
    );
  }

  Widget _listTile(int i) {
    final payload = _payloadAt(i) ?? {};
    return Column(
      children: [
        if (i > 0) const Divider(height: 1),
        MemoryListTile(
          payload: payload,
          updatedAt: _items[i]['updated_at'] as String?,
          selected: _selectedIndex == i,
          onTap: () => _openDetail(i),
        ),
      ],
    );
  }

  Widget _detailPane() {
    if (_selectedIndex == null || _selectedIndex! >= _items.length) {
      return const ExoEmptyState(
        title: SyncUserMessages.selectMemoryTitle,
        subtitle: SyncUserMessages.selectMemorySubtitle,
        icon: Icons.notes_outlined,
      );
    }
    return _MemoryDetailBody(payload: _payloadAt(_selectedIndex!)!);
  }

  Widget _emptyState() {
    if (_isSearch) {
      return ExoEmptyState(
        title: SyncUserMessages.searchNoMatchesTitle,
        subtitle: SyncUserMessages.searchNoMatchesSubtitle(_query!),
        icon: Icons.search_off_outlined,
      );
    }
    return ListenableBuilder(
      listenable: widget.config,
      builder: (context, _) {
        return SyncCollectionEmpty(
          kind: classifySyncListEmpty(widget.config),
          syncedEmptyTitle: SyncUserMessages.memoryEmptyTitle,
          syncedEmptySubtitle: SyncUserMessages.memoryEmptySubtitle,
          icon: Icons.psychology_outlined,
          syncInFlight: widget.config.syncInFlight,
          onPair: widget.onPairAgain,
        );
      },
    );
  }

  Widget _listBody() {
    if (_items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 80),
          _emptyState(),
        ],
      );
    }

    final list = ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: _items.length,
      itemBuilder: (context, i) => _listTile(i),
    );

    if (exoUseNavigationRail(context)) {
      return Row(
        children: [
          Expanded(flex: 2, child: list),
          const VerticalDivider(width: 1),
          Expanded(flex: 3, child: _detailPane()),
        ],
      );
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return SyncCollectionScaffold(
      config: widget.config,
      onSignInAgain: widget.onSignInAgain,
      onPairAgain: widget.onPairAgain,
      showReadyWhenSynced: true,
      header: MemorySearchField(
        controller: _searchController,
        onSubmitted: _submitSearch,
        onCleared: _clearSearch,
      ),
      listBody: _listBody(),
    );
  }
}

class _MemoryDetailPage extends StatelessWidget {
  const _MemoryDetailPage({required this.payload});

  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(MemoryListTile.titleOf(payload))),
      body: _MemoryDetailBody(payload: payload),
    );
  }
}

class _MemoryDetailBody extends StatelessWidget {
  const _MemoryDetailBody({required this.payload});

  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final category = payload['category']?.toString().trim();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      child: ExoContentWidth(
        child: ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                MemoryListTile.titleOf(payload),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (category != null && category.isNotEmpty) ...[
                const SizedBox(height: ExoSpacing.sm),
                Text(category, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: ExoSpacing.lg),
              const Divider(height: 1),
              const SizedBox(height: ExoSpacing.lg),
              Text(
                '${payload['content'] ?? payload['description'] ?? ''}',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
