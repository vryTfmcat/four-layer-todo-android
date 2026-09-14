package com.obsidiancodx.fourlayertodo.data

import android.content.Context
import android.net.Uri
import com.obsidiancodx.fourlayertodo.model.TodoIndex
import com.obsidiancodx.fourlayertodo.model.TodoTask

class TodoRepository(context: Context) {
    private val store = VaultDocumentStore(context)

    fun persistPermission(uri: Uri) = store.persistPermission(uri)

    fun index(uri: Uri): TodoIndex {
        val (root, files) = store.scanMarkdown(uri)
        val parsed = files.mapNotNull { file ->
            val placement = MarkdownTaskParser.placement(file.relativePath) ?: return@mapNotNull null
            val title = file.document.name?.removeSuffix(".md") ?: return@mapNotNull null
            val task = MarkdownTaskParser.parse(file.raw, title) ?: return@mapNotNull null
            TodoTask(
                id = task.id,
                title = title,
                detail = task.detail,
                priority = task.priority,
                done = task.done,
                sortKey = task.sortKey.takeIf { it != 0L } ?: file.modifiedAt,
                layer = placement.layer,
                poolTitle = placement.poolTitle,
                relativePath = file.relativePath,
                sourceHash = file.hash,
                modifiedAt = file.modifiedAt,
                readOnlyConflict = file.relativePath.contains(".sync-conflict-")
            )
        }
        var shadowCopyCount = 0
        val canonicalized = parsed.groupBy { it.id }.values.flatMap { group ->
            val canonicalPath = MarkdownTaskParser.selectNumericShadowCanonicalPath(
                group.map { it.relativePath }
            )
            if (canonicalPath == null) {
                group
            } else {
                shadowCopyCount += group.size - 1
                group.filter { it.relativePath == canonicalPath }
            }
        }
        val duplicates = canonicalized.groupBy { it.id }
            .filterValues { it.size > 1 }
            .mapValues { (_, tasks) -> tasks.map { it.relativePath }.sorted() }
        val tasks = canonicalized.map { task ->
            task.copy(readOnlyConflict = task.readOnlyConflict || duplicates.containsKey(task.id))
        }.sortedWith(compareBy<TodoTask>({ it.layer.order }, { it.sortKey }, { it.title }))
        return TodoIndex(tasks, duplicates, shadowCopyCount, root.label)
    }

    fun setDone(uri: Uri, task: TodoTask, done: Boolean): TodoTask {
        check(!task.readOnlyConflict) { "重复 ID 的任务为只读，请先在 Obsidian 中解决冲突" }
        val current = store.findMarkdown(uri, task.relativePath)
        check(current.hash == task.sourceHash) {
            "${task.relativePath} 已变化，请先刷新后重试"
        }
        val updatedRaw = MarkdownTaskParser.updateDone(current.raw, done)
        val updated = store.updateMarkdown(current, updatedRaw)
        return task.copy(done = done, sourceHash = updated.hash, modifiedAt = updated.modifiedAt)
    }
}
