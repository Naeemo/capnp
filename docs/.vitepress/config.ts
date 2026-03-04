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
          {
            text: 'Guide',
            items: [
              { text: 'Getting Started', link: '/getting-started' },
              { text: 'Quick Start', link: '/quickstart' },
              { text: 'RPC Guide', link: '/rpc-guide' },
              { text: 'Debugging', link: '/guides/debugging' },
            ],
          },
          { text: 'Performance', link: '/performance' },
          { text: 'Changelog', link: '/changelog' },
        ],
        sidebar: {
          '/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/' },
                { text: 'Getting Started', link: '/getting-started' },
                { text: 'Quick Start', link: '/quickstart' },
                { text: 'Examples', link: '/examples' },
              ],
            },
            {
              text: 'Guides',
              items: [
                { text: 'RPC Guide', link: '/rpc-guide' },
                { text: 'Streaming', link: '/guides/streaming' },
                { text: 'Dynamic Schema', link: '/guides/dynamic-schema' },
                { text: 'Code Generation', link: '/guides/codegen' },
                { text: 'WebSocket Proxy', link: '/guides/websocket-proxy' },
                { text: 'Debugging', link: '/guides/debugging' },
              ],
            },
            {
              text: 'Best Practices',
              items: [
                { text: 'Error Handling', link: '/best-practices/error-handling' },
                { text: 'Performance Tips', link: '/best-practices/performance' },
              ],
            },
            {
              text: 'Reference',
              items: [
                { text: 'Performance', link: '/performance' },
                { text: 'Benchmarks', link: '/benchmarks' },
                { text: 'Changelog', link: '/changelog' },
              ],
            },
          ],
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '首页', link: '/zh/' },
          {
            text: '指南',
            items: [
              { text: '快速开始', link: '/zh/getting-started' },
              { text: 'RPC 指南', link: '/zh/rpc-guide' },
              { text: '调试模式', link: '/zh/guides/debugging' },
            ],
          },
          { text: '性能', link: '/zh/performance' },
          { text: '更新日志', link: '/zh/changelog' },
        ],
        sidebar: {
          '/zh/': [
            {
              text: '入门',
              items: [
                { text: '介绍', link: '/zh/' },
                { text: '快速开始', link: '/zh/getting-started' },
                { text: 'RPC 指南', link: '/zh/rpc-guide' },
              ],
            },
            {
              text: '指南',
              items: [
                { text: '流式处理', link: '/zh/guides/streaming' },
                { text: '动态 Schema', link: '/zh/guides/dynamic-schema' },
                { text: '代码生成', link: '/zh/guides/codegen' },
                { text: 'WebSocket 代理', link: '/zh/guides/websocket-proxy' },
                { text: '调试模式', link: '/zh/guides/debugging' },
              ],
            },
            {
              text: '最佳实践',
              items: [
                { text: '错误处理', link: '/zh/best-practices/error-handling' },
                { text: '性能优化', link: '/zh/best-practices/performance' },
              ],
            },
            {
              text: '参考',
              items: [
                { text: '性能', link: '/zh/performance' },
                { text: '基准测试', link: '/zh/benchmarks' },
                { text: '更新日志', link: '/zh/changelog' },
              ],
            },
          ],
        },
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
