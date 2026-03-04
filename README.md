# 趣友 - 根据兴趣匹配交友

根据兴趣进行匹配交友的网站，通过问卷发现志同道合的朋友。

## 功能特性

- 📋 **兴趣问卷**：完成问卷，发现你的兴趣类型
- 💕 **智能匹配**：根据答案相似度匹配志同道合的朋友
- 🔗 **分享邀请**：生成分享链接或带二维码的分享卡片
- 👤 **个人中心**：完善资料，匹配成功后可见联系方式
- ✨ **双向确认**：双方同意后即可查看彼此信息

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

## 项目结构

```
src/
├── components/     # 公共组件
├── lib/           # 工具与 Supabase 客户端
├── pages/         # 页面组件
└── App.tsx        # 应用入口与路由
```

## License

MIT
