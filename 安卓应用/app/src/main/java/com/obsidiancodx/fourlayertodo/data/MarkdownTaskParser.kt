package com.obsidiancodx.fourlayertodo.data

import com.obsidiancodx.fourlayertodo.model.ParsedTask
import com.obsidiancodx.fourlayertodo.model.TaskPlacement
import com.obsidiancodx.fourlayertodo.model.TodoLayer

object MarkdownTaskParser {
    private val frontmatterPattern = Regex("^\\uFEFF?---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?")
    private val entryPattern = Regex("^([A-Za-z][A-Za-z0-9_-]*):\\s*(.*)$")

    fun parse(content: String, fileTitle: String): ParsedTask? {
        val match = frontmatterPattern.find(content) ?: return null
        val values = match.groupValues[1].lineSequence().mapNotNull { line ->
            entryPattern.matchEntire(line)?.let { it.groupValues[1] to it.groupValues[2].trim() }
        }.toMap()
        if (values["fourLayerTodo"] != "true") return null
        val id = decodeString(values["id"]).orEmpty()
        if (id.isBlank()) return null

        val body = content.removeRange(match.range).trim()
        val heading = Regex("^#\\s+(.+?)(?:\\r?\\n|$)").find(body)
        val detail = if (heading?.groupValues?.get(1)?.trim() == fileTitle) {
            body.removeRange(heading.range).trim()
        } else {
            body
        }

        return ParsedTask(
            id = id,
            detail = detail,
            priority = decodeString(values["priority"])?.takeIf { it in setOf("P2", "P3", "P4", "P5") },
            done = when (values["done"]) {
                "true" -> true
                "false" -> false
                else -> null
            },
            sortKey = values["sortKey"]?.toLongOrNull()
                ?: values["order"]?.toLongOrNull()
                ?: 0L
        )
    }

    fun placement(relativePath: String): TaskPlacement? {
        val path = relativePath.replace('\\', '/')
        return when {
            path.startsWith("白板/") -> TaskPlacement(TodoLayer.WHITEBOARD)
            path.startsWith("缓存工作台/收集箱/") -> TaskPlacement(TodoLayer.INBOX)
            path.startsWith("缓存工作台/待办列表/") -> TaskPlacement(TodoLayer.TODO)
            path.startsWith("缓存工作台/缓存列表/") -> TaskPlacement(TodoLayer.CACHE)
            path.startsWith("任务存储器/") -> {
                val remainder = path.removePrefix("任务存储器/")
                val pool = remainder.substringBefore('/').takeIf { '/' in remainder && it.isNotBlank() }
                pool?.let { TaskPlacement(TodoLayer.STORAGE, it) }
            }
            else -> null
        }
    }

    fun updateDone(content: String, done: Boolean): String {
        val match = frontmatterPattern.find(content)
            ?: error("不是带 frontmatter 的 Markdown 待办")
        val newline = if (content.contains("\r\n")) "\r\n" else "\n"
        val block = match.value
        val doneLine = Regex("(?m)^done:[ \\t]*[^\\r\\n]*")
        val updatedBlock = if (doneLine.containsMatchIn(block)) {
            block.replace(doneLine, "done: $done")
        } else {
            val closing = "$newline---"
            val position = block.lastIndexOf(closing)
            check(position >= 0) { "frontmatter 结束标记无效" }
            block.substring(0, position) + "$newline" + "done: $done" + block.substring(position)
        }
        return content.replaceRange(match.range, updatedBlock)
    }

    fun selectNumericShadowCanonicalPath(paths: List<String>): String? {
        if (paths.size < 2) return null
        data class PathParts(val path: String, val directory: String, val basename: String)
        val entries = paths.map { path ->
            val slash = path.lastIndexOf('/')
            val directory = if (slash >= 0) path.substring(0, slash) else ""
            val fileName = if (slash >= 0) path.substring(slash + 1) else path
            PathParts(path, directory, fileName.removeSuffix(".md"))
        }
        if (entries.map { it.directory }.distinct().size != 1) return null
        val candidates = entries.filter { candidate ->
            entries.all { entry ->
                if (entry.path == candidate.path) return@all true
                if (!entry.basename.startsWith("${candidate.basename} ")) return@all false
                entry.basename.removePrefix("${candidate.basename} ")
                    .matches(Regex("^(?:\\d+)(?: \\d+)*$"))
            }
        }
        return candidates.singleOrNull()?.path
    }

    private fun decodeString(value: String?): String? {
        val raw = value?.trim() ?: return null
        if (raw == "null" || raw == "~" || raw.isBlank()) return null
        if (raw.length >= 2 && raw.first() == '"' && raw.last() == '"') {
            return raw.substring(1, raw.length - 1)
                .replace("\\\"", "\"")
                .replace("\\n", "\n")
                .replace("\\\\", "\\")
        }
        return raw
    }
}
