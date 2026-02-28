import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "@naeemo/capnp",
  description: 'A pure TypeScript implementation of Cap\'n Proto',
  base: '/capnp/',
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quick Start', link: '/quickstart' },
      { text: 'Changelog', link: '/changelog' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Quick Start', link: '/quickstart' },
          { text: 'Changelog', link: '/changelog' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Naeemo/capnp' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@naeemo/capnp' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-2026 Naeemo'
    }
  }
})
