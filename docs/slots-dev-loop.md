# Slots 开发循环

试玩 H5（Slots）从构建、云真机自动化验证、异常监控到修复合入的闭环流程。

![Slots 开发循环总览](./technical-challenges/images/slots-dev-loop-zh.png)

## 总览循环（Mermaid 源码）

```mermaid
flowchart TB
    subgraph CI["① GitHub CI"]
        A1[触发构建]
        A2[打包 H5]
        A3[部署到试玩环境]
        A1 --> A2 --> A3
    end

    subgraph AgentTest["② Agent + 云真机 MCP"]
        B1[云真机打开 H5]
        B2[Spin 等玩法模拟]
        B3[截图 / 行为验收]
        B1 --> B2 --> B3
    end

    subgraph Monitor["③ Sentry"]
        C1[运行时异常采集]
        C2[Issue / 堆栈聚合]
        C1 --> C2
    end

    subgraph AgentFix["④ Agent 异常处理"]
        D1[异常报告 / 告警]
        D2[拉取代码]
        D3[定位 & 根因分析]
        D1 --> D2 --> D3
    end

    subgraph Dev["⑤ 修复 & 合入"]
        E1[本地 / Agent 修复]
        E2[提交 MR]
        E1 --> E2
    end

    subgraph Review["⑥ Review"]
        F1{人 Review 或<br/>自动合并?}
        F2[合并到主分支]
        F1 -->|通过| F2
    end

    A3 --> B1
    B3 --> C1
    C2 -->|有异常| D1
    B3 -->|无异常| F1
    C2 -->|无异常| F1
    D3 --> E1
    E2 --> F1
    F2 -->|回到 ①| A1

    style CI fill:#e8f4fc,stroke:#0969da
    style AgentTest fill:#f0fdf4,stroke:#1a7f37
    style Monitor fill:#fff8e6,stroke:#bf8700
    style AgentFix fill:#fbefff,stroke:#8250df
    style Dev fill:#fff1eb,stroke:#bc4c00
    style Review fill:#f6f8fa,stroke:#656d76
```

## 时序视角（单轮迭代）

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub / CI
    participant H5 as H5 试玩环境
    participant DK as 云真机 MCP
    participant AG as Agent
    participant SE as Sentry
    participant MR as MR / Review

    GH->>H5: 构建并部署
    AG->>DK: 打开 H5 URL
    DK->>H5: 加载游戏
    AG->>DK: Spin 模拟 / 操作脚本
    H5-->>SE: 前端异常上报
    SE-->>AG: Issue / 异常报告
    alt 发现异常
        AG->>GH: 拉取代码
        AG->>AG: 定位分析
        AG->>MR: 修复后提 MR
        MR->>GH: Review 通过 / 自动合并
    else 验证通过
        AG->>MR: 可选：记录验收结果
    end
    GH->>H5: 新一轮 CI 部署
```

## 步骤说明

| 步骤 | 角色 | 说明 |
|------|------|------|
| **①** | GitHub CI | 代码 push / MR 合并后自动构建 Slots H5，部署到可访问的试玩地址 |
| **②** | Agent + 云真机 MCP | Agent 通过 DeviceKeeper 等 MCP 在真机/云真机上打开 H5，执行 Spin 等核心路径模拟 |
| **③** | Sentry | 监控运行时 JS 异常、性能与自定义事件，形成可追踪的 Issue |
| **④** | Agent | 根据 Sentry 报告拉取对应版本代码，结合堆栈与仓库上下文做定位分析 |
| **⑤** | 开发者 / Agent | 修复缺陷后提交 MR，附带复现信息与 Sentry 链接 |
| **⑥** | 人 / 策略 | Code Review 或满足条件的自动合并；合入后触发 **①**，形成闭环 |

## 关键集成（本仓库相关）

- **H5 换皮 / 重打包**：`feat/texture-replace` + `tools/repack-web`（非 main 主流程）
- **试玩 → Creator 复刻**：本仓库 Skill `inspector-scene-recovery` + `docs/features/scene-recovery.md`
- **云真机**：`user-devicekeeper` MCP
- **异常**：`plugin-sentry-sentry` MCP / Sentry SDK
- **Agent 闭环**：Cursor Agent + Memory Logs 跨会话上下文
