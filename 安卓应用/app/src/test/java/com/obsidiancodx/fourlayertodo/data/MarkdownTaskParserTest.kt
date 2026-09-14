package com.obsidiancodx.fourlayertodo.data

import com.obsidiancodx.fourlayertodo.model.TodoLayer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownTaskParserTest {
    private val sample = """---
fourLayerTodo: true
id: "canvas-123"
priority: "P4"
done: null
sortKey: 1789213902238
objectId: null
linkedNotePath: null
---

需要做的事情
"""

    @Test
    fun parsesManagedTask() {
        val task = MarkdownTaskParser.parse(sample, "四层待办的手机端")
        requireNotNull(task)
        assertEquals("canvas-123", task.id)
        assertEquals("P4", task.priority)
        assertNull(task.done)
        assertEquals(1789213902238L, task.sortKey)
        assertEquals("需要做的事情", task.detail)
    }

    @Test
    fun ignoresOrdinaryMarkdown() {
        assertNull(MarkdownTaskParser.parse("# 普通笔记", "普通笔记"))
    }

    @Test
    fun updatesOnlyDoneField() {
        val updated = MarkdownTaskParser.updateDone(sample, true)
        assertTrue(updated.contains("done: true"))
        assertFalse(updated.contains("done: null"))
        assertTrue(updated.endsWith("需要做的事情\n"))
        assertEquals("canvas-123", MarkdownTaskParser.parse(updated, "标题")?.id)
    }

    @Test
    fun classifiesFourLayerPaths() {
        assertEquals(TodoLayer.WHITEBOARD, MarkdownTaskParser.placement("白板/a.md")?.layer)
        assertEquals(TodoLayer.INBOX, MarkdownTaskParser.placement("缓存工作台/收集箱/a.md")?.layer)
        assertEquals(TodoLayer.TODO, MarkdownTaskParser.placement("缓存工作台/待办列表/a.md")?.layer)
        assertEquals(TodoLayer.CACHE, MarkdownTaskParser.placement("缓存工作台/缓存列表/a.md")?.layer)
        assertEquals("生活", MarkdownTaskParser.placement("任务存储器/生活/a.md")?.poolTitle)
        assertNull(MarkdownTaskParser.placement("归档/2026-09-13/a.md"))
    }

    @Test
    fun selectsObsidianNumericShadowCanonicalPath() {
        assertEquals(
            "白板/任务.md",
            MarkdownTaskParser.selectNumericShadowCanonicalPath(
                listOf("白板/任务.md", "白板/任务 1.md", "白板/任务 1 1.md")
            )
        )
        assertNull(
            MarkdownTaskParser.selectNumericShadowCanonicalPath(
                listOf("白板/任务.md", "待办列表/任务 1.md")
            )
        )
    }
}
