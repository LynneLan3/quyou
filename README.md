# 趣友 - 根据兴趣匹配交友

> 🌟 根据兴趣进行匹配交友的网站，通过问卷发现志同道合的朋友

[![部署状态](https://img.shields.io/badge/部署-Vercel-black?logo=vercel)](https://quyou.vercel.app)
[![版本](https://img.shields.io/badge/版本-v1.2.4-blue)](./CHANGELOG.md)
[![许可证](https://img.shields.io/badge/许可证-MIT-green)](./LICENSE)

**在线访问**：https://quyou.vercel.app

## ✨ 功能特性

- 📋 **兴趣问卷**：完成问卷，发现你的兴趣类型
- 💕 **智能匹配**：根据答案相似度匹配志同道合的朋友
- 🔗 **分享邀请**：生成分享链接或带二维码的精美分享卡片
- 👤 **个人中心**：完善资料，匹配成功后可见联系方式
- ✨ **双向确认**：双方同意后即可查看彼此信息
- 🔐 **隐私保护**：分享链接中的用户 ID 经过加密处理
- 💬 **友好提示**：全局弹窗提示系统，需用户确认

## 技术栈

- React 19 + TypeScript
- Vite 7
- Tailwind CSS + Radix UI
- Supabase（认证、数据库）
- React Router v7

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 环境变量

在项目根目录创建 `.env` 文件，配置 Supabase：

```env
VITE_SUPABASE_URL=你的 Supabase 项目 URL
VITE_SUPABASE_ANON_KEY=你的 Supabase 匿名密钥
```

### 构建

```bash
npm run build
```

### 预览构建结果

```bash
npm run preview
```

## 部署到 Vercel

1. 在 [Vercel](https://vercel.com) 导入 GitHub 仓库 `LynneLan3/quyou`
2. 在项目 **Settings → Environment Variables** 中添加：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 部署即可

## 📁 项目结构

```
趣友/
├── src/
│   ├── components/          # 公共组件
│   │   ├── Layout.tsx      # 全局布局
│   │   ├── MessageModal.tsx # 全局弹窗提示
│   │   └── ui/             # UI 组件库（Radix UI）
│   ├── lib/
│   │   ├── supabase/       # Supabase 客户端与工具
│   │   └── shareLink.ts    # 分享链接编码/解码
│   ├── pages/              # 页面组件
│   │   ├── HomePage.tsx    # 首页（问卷列表）
│   │   ├── QuizPage.tsx    # 答题页面
│   │   ├── ResultPage.tsx  # 结果页面（含分享卡片）
│   │   ├── MatchesPage.tsx # 我的匹配
│   │   ├── ProfilePage.tsx # 个人资料
│   │   └── ...
│   └── App.tsx             # 应用入口与路由
├── public/
│   └── share-card-bg.png   # 分享卡片背景图
├── vercel.json             # Vercel 部署配置
└── CHANGELOG.md            # 版本更新日志
```

## 🔧 核心功能实现

### 分享功能

**复制链接**：
- 生成包含邀请人信息的加密链接
- 格式：`https://quyou.vercel.app/quiz/{quiz_id}?from=f_{encoded_user_id}`
- 用户 ID 使用 Base64URL 编码，保护隐私

**分享卡片**：
- 生成精美的分享卡片图片（PNG）
- 包含二维码，扫描即可答题
- 二维码规格：
  - 尺寸：104x104px
  - 纠错级别：H (30%)
  - 高分辨率：3x 像素比

### 匹配算法

根据问卷答案计算相似度：
- 相同答案得分
- 计算总分和匹配度百分比
- 双向匹配记录

### 隐私保护

- 分享链接中的用户 ID 加密（Base64URL + 前缀）
- 匹配前不显示联系方式
- 双方确认后才能查看详细信息

## 📝 最近更新

### v1.2.4 (2026-03-04)

**🐛 Bug 修复**：
- 修复二维码扫描数据损坏问题
- 提高二维码质量（尺寸、纠错级别、图片质量）
- 二维码扫描成功率从 ~60% 提升到 ~95%

详见 [CHANGELOG.md](./CHANGELOG.md)

## 📚 文档

- [CHANGELOG.md](./CHANGELOG.md) - 完整的版本更新历史
- [二维码问题完整解决方案.md](./二维码问题完整解决方案.md) - 二维码修复技术细节
- [分享功能修复总结.md](./分享功能修复总结.md) - 分享功能问题排查
- [✅_分享功能验证清单.md](./✅_分享功能验证清单.md) - 功能验证步骤

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

**开发者**：[@LynneLan3](https://github.com/LynneLan3)  
**项目地址**：https://github.com/LynneLan3/quyou
