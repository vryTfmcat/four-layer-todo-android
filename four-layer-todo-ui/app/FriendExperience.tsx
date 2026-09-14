"use client";

import { useState } from "react";
import { TodoWorkspace } from "./TodoWorkspace";

function FriendGuide({ onClose }: { onClose: () => void }) {
  const resetDemo = () => {
    window.localStorage.removeItem("four-layer-todo-prototype");
    window.localStorage.removeItem("four-layer-todo-public-v2");
    window.location.reload();
  };

  return (
    <div className="friend-guide-backdrop" role="dialog" aria-modal="true">
      <section className="friend-guide">
        <span className="friend-guide-kicker">朋友体验版 · 约 5 分钟</span>
        <h1>先只关注你正在做的事</h1>
        <p className="friend-guide-lead">
          这是一个按“注意力距离”组织任务的原型。它不要求你每天面对完整任务库。
        </p>
        <ol className="friend-guide-steps">
          <li>
            <strong>看看白板</strong>
            <span>首页只放正在处理的任务和拆解。</span>
          </li>
          <li>
            <strong>翻到背面</strong>
            <span>右上角翻转后，可以看到收集箱、待办和缓存。</span>
          </li>
          <li>
            <strong>进入任务存储器</strong>
            <span>从背面下方进入完整 Kanban，再看看外围长期对象。</span>
          </li>
          <li>
            <strong>随便操作</strong>
            <span>移动、完成或缓存演示任务，不会影响任何真实数据。</span>
          </li>
        </ol>
        <div className="friend-guide-note">
          AI 按钮目前只演示入口。体验后请告诉我：哪里找不到、哪里让你犹豫、最想保留什么？
        </div>
        <div className="friend-guide-actions">
          <button className="friend-reset-button" onClick={resetDemo}>
            重置演示数据
          </button>
          <button className="friend-start-button" onClick={onClose}>
            开始体验 →
          </button>
        </div>
      </section>
    </div>
  );
}

export function FriendExperience() {
  const [guideOpen, setGuideOpen] = useState(true);

  return (
    <>
      <TodoWorkspace />
      <button
        className="friend-help-button"
        onClick={() => setGuideOpen(true)}
        aria-label="打开朋友体验说明"
      >
        ?
      </button>
      {guideOpen ? <FriendGuide onClose={() => setGuideOpen(false)} /> : null}
    </>
  );
}
