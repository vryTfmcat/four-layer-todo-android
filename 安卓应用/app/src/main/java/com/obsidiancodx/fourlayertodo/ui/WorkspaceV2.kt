package com.obsidiancodx.fourlayertodo.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import com.obsidiancodx.fourlayertodo.*
import com.obsidiancodx.fourlayertodo.data.TimeBlock
import com.obsidiancodx.fourlayertodo.model.*
import org.json.JSONObject
import org.json.JSONArray
import java.time.*
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

private val ink = Color(0xFF456B5B)
private val pageColor = Color(0xFFF6F4ED)
private val activityColors = linkedMapOf("学习" to Color(0xFFC3A817), "工作" to Color(0xFF91A333), "个人" to Color(0xFF24A1A9), "家人朋友" to Color(0xFF9781BD), "日常" to Color(0xFF607F85), "休息" to Color(0xFF8EA8C2))
private fun timeLabel(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalTime().toString().take(5)
private fun dateOf(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).toLocalDate()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceV2(vm: MainViewModel) {
    val s by vm.state.collectAsState()
    var timePage by rememberSaveable { mutableStateOf(false) }
    var layer by rememberSaveable { mutableStateOf("白板") }
    var focus by rememberSaveable { mutableStateOf(true) }
    var detail by remember { mutableStateOf<TodoTask?>(null) }
    var edit by remember { mutableStateOf<TimeBlock?>(null) }
    var settings by remember { mutableStateOf(false) }
    var capture by remember { mutableStateOf(false) }
    var captureText by remember { mutableStateOf("") }
    var lastDeleted by remember { mutableStateOf<TimeBlock?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { it?.let(vm::selectVault) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.reminders(it) }
    BackHandler(layer != "白板" || timePage) { layer = "白板"; timePage = false }
    MaterialTheme(colorScheme = lightColorScheme(primary = ink, background = pageColor, surface = pageColor)) {
        Scaffold(containerColor = pageColor, topBar = { TopAppBar(title = { Text(if(timePage) "时间记录" else layer, fontWeight = FontWeight.Bold) }, actions = {
            TextButton(onClick = { capture = true }, enabled = !s.busy) { Text("＋") }; TextButton(onClick = { vm.refresh() }, enabled = !s.busy) { Text("刷新") }; TextButton(onClick = { settings = true }, enabled = !s.busy) { Text("设置") }
        }) }, bottomBar = { NavigationBar {
            NavigationBarItem(!timePage, { timePage = false }, icon = { Text("▧") }, label = { Text("四层待办") })
            NavigationBarItem(timePage, { timePage = true }, icon = { Text("▦") }, label = { Text("时间与计划") })
        } }) { padding -> Column(Modifier.padding(padding).fillMaxSize()) {
            if(s.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            Text(s.message, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall, maxLines = 3)
            lastDeleted?.let { deleted -> TextButton(enabled = !s.busy, onClick = { vm.saveBlock(deleted.revision().copy(deleted = false)); lastDeleted = null }) { Text("撤销删除：${deleted.title}") } }
            if(vm.treeUri == null) Column(Modifier.padding(28.dp)) {
                Text("你的待办，你的时间", style = MaterialTheme.typography.headlineMedium)
                Text("选择本地 Obsidian 库，文件由 Syncthing-Fork 同步。", Modifier.padding(vertical = 20.dp))
                Button(onClick = { picker.launch(null) }) { Text("选择库目录") }
            } else BoxWithConstraints(Modifier.weight(1f)) {
                val wide = maxWidth >= 840.dp
                Row(Modifier.fillMaxSize()) {
                    if(!timePage || wide) Column(Modifier.weight(1f).fillMaxHeight()) {
                        if(layer in listOf("白板", "工作台")) {
                            val angle by animateFloatAsState(if(layer == "工作台") 180f else 0f, label = "flip")
                            val showingBack = angle > 90f
                            Column(Modifier.weight(1f).graphicsLayer { rotationY = if(showingBack) angle-180f else angle; cameraDistance = 20*density }) {
                                if(!showingBack) {
                                    Row(Modifier.padding(horizontal = 12.dp)) { FilterChip(focus, { focus = true }, { Text("聚焦") }); Spacer(Modifier.width(8.dp)); FilterChip(!focus, { focus = false }, { Text("自由画布") }) }
                                    val tasks = s.tasks.filter { it.layer == TodoLayer.WHITEBOARD }
                                    if(focus) Cards(tasks, s.busy, { detail = it }, vm::toggleDone) else FreeBoard(tasks, s.canvas, s.busy, { detail = it }, vm::saveCanvas)
                                } else {
                                    var tab by rememberSaveable { mutableIntStateOf(0) }
                                    val kinds = listOf(TodoLayer.INBOX, TodoLayer.TODO, TodoLayer.CACHE)
                                    TabRow(tab) { kinds.forEachIndexed { i,k -> Tab(tab == i, { tab = i }, text = { Text("${k.label} ${s.tasks.count { it.layer == k }}") }) } }
                                    Cards(s.tasks.filter { it.layer == kinds[tab] }, s.busy, { detail = it }, vm::toggleDone)
                                }
                            }
                        } else if(layer == "存储器") {
                            var pool by rememberSaveable { mutableStateOf<String?>(null) }
                            OutlinedTextField(s.query, vm::setQuery, Modifier.fillMaxWidth().padding(12.dp), placeholder = { Text("搜索任务与详情") }, singleLine = true)
                            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
                                FilterChip(pool == null, { pool = null }, { Text("全部") })
                                s.tasks.mapNotNull { it.poolTitle }.distinct().forEach { p -> Spacer(Modifier.width(6.dp)); FilterChip(pool == p, { pool = p }, { Text(p) }) }
                            }
                            Box(Modifier.weight(1f)) { Cards(s.tasks.filter { it.layer == TodoLayer.STORAGE && (pool == null || it.poolTitle == pool) && (it.title+it.detail).contains(s.query,true) }, s.busy, { detail = it }, vm::toggleDone) }
                        } else LazyColumn(Modifier.weight(1f)) { items(s.objects) { (name,body) -> Card(Modifier.padding(12.dp).fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) { Text(name, fontWeight = FontWeight.Bold); Text(body.substringAfter("---\n",body).substringAfter("---",body).trim()) }
                        } } }
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.SpaceEvenly) {
                            TextButton(onClick = { layer = if(layer == "白板") "工作台" else "白板" }) { Text(if(layer == "白板") "↻ 翻到工作台" else "↻ 回白板") }
                            TextButton(onClick = { layer = "存储器" }) { Text("任务存储器 →") }
                            TextButton(onClick = { layer = "长期对象" }) { Text("长期对象") }
                        }
                    }
                    if(timePage) DayGrid(s, vm, { edit = it }, Modifier.weight(if(wide) 1.15f else 1f))
                }
            }
        } }
        if(settings) AlertDialog(onDismissRequest = { settings = false }, title = { Text("本地文件与提醒") }, text = { Column {
            Text(s.rootLabel); Text("换设备前先等待 Syncthing-Fork 同步，再点刷新。")
            TextButton(onClick = { settings = false; picker.launch(null) }) { Text("重新选择整个 Obsidian 库") }
            Row(verticalAlignment = Alignment.CenterVertically) { Switch(s.remindersEnabled, { enabled -> if(enabled && android.os.Build.VERSION.SDK_INT >= 33) permission.launch(android.Manifest.permission.POST_NOTIFICATIONS) else vm.reminders(enabled) }); Text("本机提醒") }
            Text("建议只在手机启用。按已加载计划提醒；省电模式可能延迟。跨设备修改后需刷新。", style = MaterialTheme.typography.bodySmall)
        } }, confirmButton = { TextButton(onClick = { settings = false }) { Text("完成") } })
        if(capture) AlertDialog(onDismissRequest = { capture = false }, title = { Text("快速收集") }, text = { OutlinedTextField(captureText, { captureText = it }, label = { Text("想到什么要做的事？") }) }, confirmButton = { TextButton(enabled = captureText.isNotBlank() && !s.busy, onClick = { vm.quickNote(captureText); capture = false; captureText = "" }) { Text("加入收集箱") } })
        detail?.let { task ->
            var body by remember(task.id) { mutableStateOf(task.detail) }
            AlertDialog(onDismissRequest = { detail = null }, title = { Text(task.title) }, text = { Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                OutlinedTextField(body, { body = it }, label = { Text("详情／中断进度") }, enabled = !task.readOnlyConflict)
                TextButton(enabled = !s.busy && !task.readOnlyConflict, onClick = { vm.editTask(task,body); detail = null }) { Text("保存正文") }
                Text("移动到", style = MaterialTheme.typography.labelSmall)
                val targets = listOf("白板", "缓存工作台/收集箱", "缓存工作台/待办列表", "缓存工作台/缓存列表") + s.tasks.mapNotNull { it.poolTitle }.distinct().map { "任务存储器/$it" } + "归档/${LocalDate.now()}"
                targets.forEach { target -> TextButton(enabled = !s.busy && !task.readOnlyConflict && task.relativePath.substringBeforeLast('/') != target, onClick = { vm.moveTask(task,target); detail = null }) { Text(target) } }
                Text(task.relativePath, style = MaterialTheme.typography.labelSmall)
            } },
            confirmButton = { TextButton(enabled = !s.busy && !task.readOnlyConflict, onClick = { vm.startTask(task); detail = null }) { Text("开始计时") } },
            dismissButton = { TextButton(onClick = { val now = System.currentTimeMillis(); edit = TimeBlock(title = task.title, start = now, end = now+1800000, kind = "plan", taskId = task.id); detail = null }) { Text("安排时间") } }) }
        edit?.let { b -> BlockForm(b, s.blocks.any { it.version == b.version }, s.tasks, s.busy, { edit = null }, { vm.saveBlock(it); if(it.deleted) lastDeleted = it; edit = null }, { vm.resumeBlock(b); edit = null }) }
    }
}

@Composable private fun Cards(tasks: List<TodoTask>, busy: Boolean, open: (TodoTask)->Unit, done: (TodoTask)->Unit) {
    if(tasks.isEmpty()) Box(Modifier.fillMaxSize(), Alignment.Center) { Text("这里留给合适的下一步", color = Color.Gray) }
    else LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(tasks, key = { it.relativePath }) { t -> Card(onClick = { open(t) }, colors = CardDefaults.cardColors(containerColor = if(t.done == true) Color(0xFFE5E8E3) else Color(0xFFFFFBEA))) {
            Row(Modifier.fillMaxWidth().padding(10.dp)) { Checkbox(t.done == true, { done(t) }, enabled = !busy && !t.readOnlyConflict)
                Column(Modifier.weight(1f).padding(top = 10.dp)) { Text(t.title, fontWeight = FontWeight.SemiBold); Text(t.priority ?: t.poolTitle ?: "", color = ink, style = MaterialTheme.typography.labelSmall)
                    Text(t.detail, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall); if(t.readOnlyConflict) Text("ID 冲突 · 只读", color = Color.Red) }
            }
        } }
    }
}

@Composable private fun FreeBoard(tasks: List<TodoTask>, raw: String, busy: Boolean, open: (TodoTask)->Unit, save: (String,String)->Unit) {
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    var zoom by remember { mutableFloatStateOf(0.7f) }; var pan by remember { mutableStateOf(Offset(12f,12f)) }
    val document = remember(raw) { JSONObject(raw) }; val nodes = remember(raw) { document.optJSONArray("nodes") ?: JSONArray().also { document.put("nodes",it) } }
    val mappings = remember(raw,tasks) { tasks.associate { t -> t.id to (0 until nodes.length()).map { nodes.getJSONObject(it) }.firstOrNull { it.optString("file") == t.relativePath || it.optString("file").endsWith("/${t.relativePath}") } } }
    var positions by remember(raw,tasks) { mutableStateOf(tasks.mapIndexed { i,t -> val n = mappings[t.id]; t.id to Offset(n?.optDouble("x",0.0)?.toFloat() ?: (i%2)*280f, n?.optDouble("y",0.0)?.toFloat() ?: (i/2)*180f) }.toMap()) }
    var dirty by remember(raw) { mutableStateOf(false) }
    Column {
        Row { TextButton(onClick = { zoom = (zoom*0.8f).coerceAtLeast(0.2f) }) { Text("−") }; TextButton(onClick = { zoom = (zoom*1.25f).coerceAtMost(2f) }) { Text("＋") }
            TextButton(onClick = { pan = Offset(12f,12f); zoom = 0.7f }) { Text("复位") }
            TextButton(enabled = dirty && !busy, onClick = { mappings.forEach { (id,n) -> positions[id]?.let { p -> n?.put("x",p.x.toDouble())?.put("y",p.y.toDouble()) } }; save(document.toString(2),raw) }) { Text("保存布局") }
        }
        Text("空白平移 · 双指缩放 · 长按拖动（已有 Canvas 节点）", Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.labelSmall)
        BoxWithConstraints(Modifier.fillMaxSize().background(Color(0xFFECEFE6)).pointerInput(Unit) { detectTransformGestures { _,delta,scale,_ -> pan += delta; zoom = (zoom*scale).coerceIn(0.2f,2f) } }.graphicsLayer { clip = true }) {
            val availableWidth = maxWidth.value
            LaunchedEffect(raw, availableWidth) {
                val minX=positions.values.minOfOrNull{it.x}?:0f; val maxX=positions.values.maxOfOrNull{it.x}?:250f; val minY=positions.values.minOfOrNull{it.y}?:0f
                zoom=((availableWidth-24)/(maxX-minX+250)).coerceIn(0.2f,1f)
                pan=Offset(12-minX*zoom*density,12-minY*zoom*density)
            }
            Canvas(Modifier.fillMaxSize()) { val edges = document.optJSONArray("edges") ?: JSONArray()
                for(i in 0 until edges.length()) { val e = edges.getJSONObject(i)
                    fun pos(key: String): Offset? { val id = mappings.entries.firstOrNull { it.value?.optString("id") == e.optString(key) }?.key ?: return null; return positions[id]?.let { it*zoom*density+pan+Offset(125f,75f)*zoom*density } }
                    val a=pos("fromNode"); val b=pos("toNode"); if(a!=null && b!=null) drawLine(ink.copy(alpha=.45f),a,b,2f)
                }
            }
            tasks.forEach { task -> val p = positions[task.id] ?: Offset.Zero
                val nodeColor = when(mappings[task.id]?.optString("color")) { "1"->Color(0xFFF6D6D3); "2"->Color(0xFFFFE3C4); "4"->Color(0xFFDCE9CD); "5"->Color(0xFFD4E6F4); "6"->Color(0xFFE7DAF3); else->Color(0xFFFFF8D9) }
                Card(onClick = { open(task) }, modifier = Modifier.offset { IntOffset((p.x*zoom*density+pan.x).roundToInt(),(p.y*zoom*density+pan.y).roundToInt()) }.width((250*zoom).dp).height((150*zoom).dp)
                    .pointerInput(task.id,zoom) { detectDragGesturesAfterLongPress { change,amount -> if(mappings[task.id]!=null) { change.consume(); positions = positions+(task.id to (positions.getValue(task.id)+amount/(zoom*density))); dirty=true } } },
                    colors = CardDefaults.cardColors(containerColor = nodeColor)) { Column(Modifier.padding(10.dp)) { Text(task.title,fontSize=(16*zoom).sp,maxLines=3); Text(task.detail,fontSize=(12*zoom).sp,maxLines=4) } }
            }
            for(i in 0 until nodes.length()) { val n=nodes.getJSONObject(i); if(n.optString("type")=="text") {
                Text(n.optString("text"),modifier=Modifier.offset { IntOffset((n.optDouble("x").toFloat()*zoom*density+pan.x).roundToInt(),(n.optDouble("y").toFloat()*zoom*density+pan.y).roundToInt()) }.width((220*zoom).dp).background(Color(0xFFFAFAED)).padding(8.dp),fontSize=(12*zoom).sp,maxLines=8)
            } }
        }
    }
}

@Composable private fun DayGrid(s: TodoUiState, vm: MainViewModel, edit: (TimeBlock)->Unit, modifier: Modifier) {
    var kind by rememberSaveable { mutableStateOf("actual") }; var step by rememberSaveable { mutableIntStateOf(30) }; var category by rememberSaveable { mutableStateOf("工作") }
    var selected by remember(s.day,kind,step) { mutableStateOf<Int?>(null) }; var journal by remember { mutableStateOf(false) }; var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while(true) { now=System.currentTimeMillis(); delay(1000) } }
    val beginning=s.day.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli(); val ending=s.day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val blocks=s.blocks.filter { it.start<ending && (if(it.running) now else it.end)>=beginning }
    Column(modifier.fillMaxHeight().padding(horizontal=10.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) { TextButton(onClick={vm.day(s.day.minusDays(1))}) {Text("‹")}; TextButton(onClick={vm.day(LocalDate.now())}) {Text(s.day.toString())}; TextButton(onClick={vm.day(s.day.plusDays(1))}) {Text("›")}; TextButton(onClick={step=if(step==30)15 else 30}) {Text("${step}分格")} }
        Row(Modifier.fillMaxWidth()) { (0..6).forEach { offset -> val d=s.day.minusDays((s.day.dayOfWeek.value-1).toLong()).plusDays(offset.toLong()); TextButton(onClick={vm.day(d)},contentPadding=PaddingValues(0.dp),modifier=Modifier.weight(1f)) {Text("${d.dayOfMonth}${if(s.blocks.any{dateOf(it.start)==d})"·" else ""}")} } }
        Row { FilterChip(kind=="actual",{kind="actual"},{Text("实际")}); Spacer(Modifier.width(6.dp)); FilterChip(kind=="plan",{kind="plan"},{Text("计划")}); TextButton(onClick={journal=!journal}) {Text(if(journal)"时间格" else "随手记")} }
        s.blocks.filter{it.running}.forEach { b -> Row(verticalAlignment=Alignment.CenterVertically) { Text("${b.title} · ${(now-b.start)/60000}分钟",Modifier.weight(1f),maxLines=1); TextButton(enabled=!s.busy && !b.conflict,onClick={vm.stop(b)}) {Text("暂停／结束")} } }
        if(journal) {
            Button(onClick={edit(TimeBlock(title="",category=category,start=now,kind="note"))}) {Text("＋ 随手记录")}
            TextButton(onClick=vm::exportDay,enabled=!s.busy) {Text("写回当天时间线")}
            LazyColumn { items(blocks.filter{it.kind=="note"}) { b -> TextButton(onClick={edit(b)}) {Text("${timeLabel(b.start)} ${b.title}")} }; item {Text(s.journal,Modifier.padding(8.dp))} }
        } else {
            Row(Modifier.horizontalScroll(rememberScrollState())) { activityColors.forEach { (name,color) -> FilterChip(category==name,{category=name},{Text(name,color=color)}); Spacer(Modifier.width(5.dp)) } }
            Text(if(selected==null)"点起点，再点终点补记；点色块编辑" else "已选起点，再点结束格（包含该格）",style=MaterialTheme.typography.labelSmall)
            LazyColumn(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)) {
                items(24) { hour -> Row(verticalAlignment=Alignment.CenterVertically) { Text("${hour.toString().padStart(2,'0')}:00",Modifier.width(48.dp),style=MaterialTheme.typography.labelMedium)
                    (0 until 60/step).forEach { sub -> val minute=hour*60+sub*step; val start=beginning+minute*60000L; val end=start+step*60000L
                        val hits=blocks.filter{it.kind==kind && it.start<end && (if(it.running)now else it.end)>start}; val b=hits.firstOrNull(); val color=activityColors[b?.category]?:Color(0xFFE9E9E6)
                        Box(Modifier.weight(1f).height(45.dp).padding(2.dp).background(if(kind=="plan" && b!=null)pageColor else color,RoundedCornerShape(6.dp)).border(if(b!=null || selected==minute)2.dp else 0.dp,if(selected==minute)ink else color,RoundedCornerShape(6.dp)).clickable(enabled=!s.busy) {
                            if(b!=null)edit(b) else if(selected==null)selected=minute else {val low=minOf(selected!!,minute);val high=maxOf(selected!!,minute)+step;edit(TimeBlock(title=category,category=category,start=beginning+low*60000L,end=beginning+high*60000L,kind=kind));selected=null}
                        },Alignment.Center) {Text(if(hits.size>1)"${hits.size}条重叠" else b?.title.orEmpty(),maxLines=1,overflow=TextOverflow.Ellipsis,fontSize=11.sp,color=if(kind=="actual" && b!=null)Color.White else ink)}
                    }
                } }
                item {Text("当天记录",fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=12.dp))}
                items(blocks.filter{it.kind==kind},key={it.version}) {b->TextButton(onClick={edit(b)}) {Text("${timeLabel(b.start)}–${if(b.running)"计时中" else timeLabel(b.end)} ${b.title}${if(b.conflict)" · 同步冲突" else ""}")} }
                item {Text("实际投入（跨天按当天截取）",fontWeight=FontWeight.Bold);activityColors.keys.forEach {c->val minutes=blocks.filter{it.kind=="actual" && it.category==c && !it.conflict}.sumOf{(minOf(if(it.running)now else it.end,ending)-maxOf(it.start,beginning)).coerceAtLeast(0)/60000};if(minutes>0)Text("$c  $minutes 分钟")};Text("重叠活动分别累计，不代表唯一占用时长。",style=MaterialTheme.typography.labelSmall)}
            }
        }
    }
}

@Composable private fun BlockForm(b:TimeBlock, existing:Boolean, tasks:List<TodoTask>, busy:Boolean, close:()->Unit, save:(TimeBlock)->Unit, resume:()->Unit) {
    var title by remember(b.version){mutableStateOf(b.title)};var category by remember(b.version){mutableStateOf(b.category)}
    var start by remember(b.version){mutableStateOf(Instant.ofEpochMilli(b.start).atZone(ZoneId.systemDefault()).toLocalDateTime().toString().take(16))}
    var end by remember(b.version){mutableStateOf(Instant.ofEpochMilli(b.end).atZone(ZoneId.systemDefault()).toLocalDateTime().toString().take(16))}
    var note by remember(b.version){mutableStateOf(b.note)};var remind by remember(b.version){mutableStateOf(b.reminder)};var taskId by remember(b.version){mutableStateOf(b.taskId)};var error by remember{mutableStateOf("")}
    AlertDialog(onDismissRequest=close,title={Text(if(b.kind=="plan")"安排时间" else if(b.kind=="note")"随手记录" else "实际时间")},text={Column(Modifier.heightIn(max=440.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        if(b.conflict)Text("同步冲突：双方版本保留，请先核对源文件。",color=Color.Red)
        OutlinedTextField(title,{title=it},label={Text("活动名称")})
        Row(Modifier.horizontalScroll(rememberScrollState())) {activityColors.keys.forEach {c->FilterChip(category==c,{category=c},{Text(c)})}}
        DateTimeEntry("开始", start) { start=it }
        if(b.kind!="note")DateTimeEntry("结束（可跨天）", end) { end=it }
        OutlinedTextField(note,{note=it},label={Text("备注")});Text("关联任务（可选）")
        Row(Modifier.horizontalScroll(rememberScrollState())) {FilterChip(taskId.isEmpty(),{taskId=""},{Text("不关联")});tasks.filter{!it.readOnlyConflict}.forEach {t->FilterChip(taskId==t.id,{taskId=t.id},{Text(t.title,maxLines=1)})}}
        if(b.kind=="plan")Row(verticalAlignment=Alignment.CenterVertically) {Checkbox(remind,{remind=it});Text("开始时提醒（需启用本机提醒）")};Text(error,color=Color.Red)
        if(existing && !b.conflict && !b.running) {
            if(b.kind=="actual" || b.kind=="plan")TextButton(enabled=!busy,onClick=resume){Text("${if(b.kind=="plan")"现在开始" else "继续计时"}（新增时段）")}
            TextButton(enabled=!busy,onClick={save(b.revision().copy(deleted=true))}){Text("删除此记录（可撤销）")}
        }
    }},confirmButton={TextButton(enabled=!busy && !b.conflict && !b.running,onClick={runCatching {
        val s=LocalDateTime.parse(start).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();val e=if(b.kind=="note")s else LocalDateTime.parse(end).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        require(title.isNotBlank() && e>=s){"请检查标题和起止时间"};save((if(existing)b.revision() else b).copy(title=title,category=category,start=s,end=e,note=note,taskId=taskId,reminder=remind))
    }.onFailure{error=it.message?:"日期格式错误"}}){Text("保存")}},dismissButton={TextButton(onClick=close){Text("取消")}})
}

@Composable private fun DateTimeEntry(label:String, value:String, change:(String)->Unit) {
    val context=androidx.compose.ui.platform.LocalContext.current
    val parsed=runCatching{LocalDateTime.parse(value)}.getOrDefault(LocalDateTime.now())
    Row(verticalAlignment=Alignment.CenterVertically) {
        Text(label,Modifier.width(72.dp),style=MaterialTheme.typography.labelMedium)
        TextButton(onClick={android.app.DatePickerDialog(context,{_,y,m,d->change(LocalDateTime.of(LocalDate.of(y,m+1,d),parsed.toLocalTime()).toString().take(16))},parsed.year,parsed.monthValue-1,parsed.dayOfMonth).show()}){Text(parsed.toLocalDate().toString())}
        TextButton(onClick={android.app.TimePickerDialog(context,{_,h,m->change(parsed.withHour(h).withMinute(m).toString().take(16))},parsed.hour,parsed.minute,true).show()}){Text(parsed.toLocalTime().toString().take(5))}
    }
}
