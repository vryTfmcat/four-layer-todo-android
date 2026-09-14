package com.obsidiancodx.fourlayertodo.data

import org.junit.Test
import org.junit.Assert.*

class TimeBlockTest {
    @Test(expected = IllegalStateException::class) fun alteredCopyOfSameVersionIsNotSilentlyIgnored() {
        val first=block()
        TimeBlock.resolve(listOf(first,first.copy(title="另一台设备修改")))
    }
    @Test fun diaryProjectionPreservesOriginalAndIsIdempotent() {
        val original="---\ndate: 2026-09-14\n---\n08:30 手写记录\n<!-- mi-fitness-sleep:start -->\n睡眠\n<!-- mi-fitness-sleep:end -->"
        val section="<!-- four-layer-time:start -->\n## 活动记录\n09:00–10:00 工作\n<!-- four-layer-time:end -->"
        val once=DailySection.merge(original,section)
        assertTrue(once.startsWith(original))
        assertEquals(once,DailySection.merge(once,section))
        val updated=section.replace("工作","学习")
        assertEquals(original+"\n\n"+updated+"\n",DailySection.merge(once,updated))
    }
    @Test(expected = IllegalStateException::class) fun incompleteDiaryMarkerStopsWrite() {
        DailySection.merge("手写内容\n<!-- four-layer-time:start -->", "<!-- four-layer-time:start -->\n<!-- four-layer-time:end -->")
    }
    @Test fun emptyDoneDoesNotConsumeNextPropertyOrLineEnding() {
        val raw="---\r\nfourLayerTodo: true\r\nid: test\r\ndone:\r\npriority: P2\r\n---\r\n正文"
        assertEquals(raw.replace("done:","done: true"),MarkdownTaskParser.updateDone(raw,true))
    }
    private fun block() = TimeBlock(title="学习", start=1000, end=5000)
    @Test fun revisionSupersedesParentRegardlessOfFileOrder() {
        val first=block(); val second=first.revision().copy(end=9000)
        assertEquals(listOf(second),TimeBlock.resolve(listOf(second,first,second)))
    }
    @Test fun concurrentDeviceEditsRemainVisible() {
        val first=block(); val a=first.revision().copy(end=7000); val b=first.revision().copy(end=8000)
        val result=TimeBlock.resolve(listOf(first,a,b))
        assertEquals(2,result.size); assertTrue(result.all{it.conflict})
    }
    @Test fun deletionAndUndoAreAppendOnly() {
        val first=block(); val deleted=first.revision().copy(deleted=true)
        assertTrue(TimeBlock.resolve(listOf(first,deleted)).isEmpty())
        assertEquals(deleted,TimeBlock.resolve(listOf(first,deleted),true).single())
        val restored=deleted.revision().copy(deleted=false)
        assertEquals(restored,TimeBlock.resolve(listOf(deleted,restored,first)).single())
    }
    @Test fun deleteVersusEditDoesNotSilentlyDeleteEdit() {
        val first=block(); val deleted=first.revision().copy(deleted=true); val edit=first.revision().copy(title="新内容")
        assertTrue(TimeBlock.resolve(listOf(first,deleted,edit)).single().conflict)
    }
    @Test fun runningSessionSurvivesWithoutPeriodicTicks() {
        val running=block().copy(running=true)
        assertEquals(running,TimeBlock.resolve(listOf(running)).single())
        val stopped=running.revision().copy(running=false,end=9000)
        assertEquals(8000,TimeBlock.resolve(listOf(running,stopped)).single().let{it.end-it.start})
    }
}
