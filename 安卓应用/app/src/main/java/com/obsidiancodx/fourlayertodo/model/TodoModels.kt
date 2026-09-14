package com.obsidiancodx.fourlayertodo.model

enum class TodoLayer(val label: String, val order: Int) {
    WHITEBOARD("白板", 0),
    INBOX("收集箱", 1),
    TODO("待办列表", 2),
    CACHE("缓存列表", 3),
    STORAGE("任务存储器", 4)
}

data class TodoTask(
    val id: String,
    val title: String,
    val detail: String,
    val priority: String?,
    val done: Boolean?,
    val sortKey: Long,
    val layer: TodoLayer,
    val poolTitle: String?,
    val relativePath: String,
    val sourceHash: String,
    val modifiedAt: Long,
    val readOnlyConflict: Boolean = false
)

data class ParsedTask(
    val id: String,
    val detail: String,
    val priority: String?,
    val done: Boolean?,
    val sortKey: Long
)

data class TaskPlacement(
    val layer: TodoLayer,
    val poolTitle: String? = null
)

data class TodoIndex(
    val tasks: List<TodoTask>,
    val duplicateIds: Map<String, List<String>>,
    val shadowCopyCount: Int,
    val rootLabel: String
)
