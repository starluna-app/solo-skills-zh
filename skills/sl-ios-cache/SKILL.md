---
name: sl-ios-cache
description: 为 SwiftUI/iOS 功能设计、实现或审查本地缓存策略。适用于重复网络请求、列表重进、离线回退、按用户隔离缓存、缓存失效、pull-to-refresh、图片缓存和 mutation 后状态同步；当用户提到 cache、缓存、离线、重复请求、刷新或 stale data 时使用。
---

# iOS 缓存策略

先确认数据的真相来源、可变性和用户可见的陈旧风险；不要先选 TTL。

## 决策

1. 为每个资源写下：owner、scope（账号/项目/版本）、是否可变、离线价值、数据敏感度和 mutation 入口。
2. 选择策略：
   - 会话内共享状态：同一账号、频繁重进、可由本地 mutation 保持一致。用 app-owned store，`loadIfNeeded()` 只加载一次。
   - 不可变快照：用版本/内容 ID 缓存；没有 TTL，创建新版本或显式刷新才读取远端。
   - 需要跨启动或离线：用 `Caches/` 中按账号分区的 Codable 磁盘缓存；先 hydrate，再按产品需要后台刷新。
   - 授权、余额、订阅等高风险状态：远端优先，缓存只作网络失败回退，绝不把 miss 当成免费或未授权。
   - 图片/二进制：内存 + `Caches/` 两层，按 URL 或内容 hash 键控，并允许系统逐出。
3. 把读取集中在 store/repository，不要在 SwiftUI `body` 或每个 detail view 各自发请求。
4. 定义显式刷新：pull-to-refresh 必须绕过缓存；展示刷新中的旧数据而非清空列表。
5. 每个成功 mutation 后做一个动作：用服务端返回值 `upsert`/`remove`，或在无法正确合并时 `invalidate`。失败时保留旧缓存。
6. 编写测试：重复 load 不增加请求、force refresh 增加一次、账号/项目 scope 不泄漏、create/update/delete 同步缓存、离线命中和 miss 的行为正确。

## 失效优先级

优先使用领域事件，TTL 只是兜底：`created`、`updated`、`deleted`、账号切换、项目切换、权限改变、版本 ID 改变。若资源是完成后的不可变版本，禁止因页面重建而刷新它。

先检查列表实际渲染的字段。即使历史版本不可变，若列表显示的“当前版本”状态、分数或更新时间会在 pipeline 中改变，该 pipeline write 也必须同步或失效缓存。

## SwiftUI 实现形状

让 tab/app shell 持有 `@Observable` 或 `ObservableObject` store；view 注入它并只调用 `loadIfNeeded()`。store 内部防止并发重复 load，维护 `isLoading`、加载结果和错误。不要用 view-local `@State` 作为跨页面缓存。

```swift
@MainActor final class ResourceStore: ObservableObject {
  @Published private(set) var items: [Item] = []
  private var hasLoaded = false

  func loadIfNeeded() async { guard !hasLoaded else { return }; await refresh() }
  func refresh() async { items = try await repository.fetch(); hasLoaded = true }
  func upsert(_ item: Item) { /* update items */ }
  func remove(id: Item.ID) { /* update items */ }
  func invalidate() { hasLoaded = false }
}
```

`refresh()` 只有在成功读取后才标记有效；网络错误不能覆盖已有数据。按账号缓存时，key 必须包含稳定 user ID，退出登录时清理内存状态；若磁盘数据含敏感信息，评估是否应持久化或需要额外保护。

## 项目经验

需要具体实现、反例和测试名称时，读取 [references/starluna-examples.md](references/starluna-examples.md)。
