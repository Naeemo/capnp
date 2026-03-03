import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '@naeemo/capnp',
  description: "A pure TypeScript implementation of Cap'n Proto",
  base: '/capnp/',
  ignoreDeadLinks: true,

  // 国际化配置
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Quick Start', link: '/quickstart' },
          { text: 'RPC Guide', link: '/rpc-guide' },
          { text: 'Performance', link: '/performance' },
          { text: 'Changelog', link: '/changelog' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Introduction', link: '/' },
              { text: 'Quick Start', link: '/quickstart' },
              { text: 'RPC Guide', link: '/rpc-guide' },
              { text: 'Performance', link: '/performance' },
              { text: 'Changelog', link: '/changelog' },
            ],
          },
        ],
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '首页', link: '/zh/' },
          { text: '快速开始', link: '/zh/quickstart' },
          { text: 'RPC 指南', link: '/zh/rpc-guide' },
          { text: '性能', link: '/zh/performance' },
          { text: '更新日志', link: '/zh/changelog' },
        ],
        sidebar: [
          {
            text: '指南',
            items: [
              { text: '介绍', link: '/zh/' },
              { text: '快速开始', link: '/zh/quickstart' },
              { text: 'RPC 指南', link: '/zh/rpc-guide' },
              { text: '性能', link: '/zh/performance' },
              { text: '更新日志', link: '/zh/changelog' },
            ],
          },
        ],
      },
    },
  },

  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/Naeemo/capnp' }],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 Naeemo',
    },
  },
});
