# StarLuna 真实缓存模式

## FounderPortal / Crackit：不可变 Idea 版本

- `FounderPortal/ViewModels/EvaluationFlowViewModel.swift` 的 `IdeaWorkspaceCache` 由长期存在的 evaluation flow 持有；`HistoryView` 重建时调用 `loadIfNeeded`，不会重拉 Ideas 和每个 version。
- 缓存没有 TTL：Idea/version 历史是不可变快照。用户的 pull-to-refresh 是明确的 live 请求。
- `createDraft`、追加 interview answer、完成 interview、启动 evaluation stage 都会使缓存失效，因为 Ideas 行仍显示当前版本状态、分数和更新时间。
- `IdeaDetailView` 从缓存的 version list 打开历史，而非每次 detail appear 时再次 `loadVersions`。这避免了“缓存了列表却在子页面重新请求”的半实现。

适用结论：把“可变当前状态”与“完成后的不可变快照”拆开；不要用任意 5 分钟 TTL 代替领域事件。

## Luna Bee：跨启动、按用户隔离、离线优先

- `path/Core/State/TravelPlansStore.swift` 是 app-wide source of truth：`loadIfNeeded` 每 session 一次，pull-to-refresh 走 `reload`，本地 create/edit/delete 用 `upsert`/`remove` 同步内存和磁盘。
- `path/Core/Persistence/CodableDiskCache.swift` 将 Codable envelope（payload + cachedAt）写到 `Caches/StructuredCache/<namespace>/<userID>.json`，原子写入，按账号 partition；系统可安全逐出 Caches。
- 离线时先 hydrate 缓存，而不是把网络失败转换为空数组。对应的 Family/Challenges/Events offline tests 覆盖了 cache hit 与 miss。
- `LiveDataRepositories.swift` 的订阅 entitlement 采用远端优先：失败时才返回按 user ID 保存的 entitlement，避免临时网络错误把 premium 用户降级为 free。

适用结论：持久缓存要区分“提升启动速度/离线”与“授权事实”；后者只能回退，不能替代服务端验证。

## Shooting Star：严格 scope 的会话缓存

- `ShootingStarFeature/Store/AppStore.swift` 的 `RevealedPostCache` 用 `(userID, projectID, planID)` scope；scope 变化会清空 entries。
- entry 键只是在 scope 内的 post ID；regenerate 成功后覆盖 entry，登出时 `removeAll`。
- `RevealedPostCacheTests` 覆盖同一 scope 命中、regenerate 覆盖、不同 plan 或账号不会泄漏。

适用结论：缓存键不是“ID 字符串”这么简单。只要数据归属受账号、workspace、project、版本或 feature flag 影响，scope 必须是 key 的一部分，并有切换测试。

## 审查清单

1. 重进 view 是否只读 store，而不是重新 fetch？
2. 每个 mutation 是否更新或失效缓存？列出 call site，不要凭感觉。
3. pull-to-refresh 是否强制 live，而普通进入是否不请求？
4. 缓存是否按用户及资源上下文隔离？
5. 失败时是否保留旧值，而不是清空或伪造默认授权？
6. 是否测试重复 load、force refresh、scope change、mutation、offline hit/miss？
