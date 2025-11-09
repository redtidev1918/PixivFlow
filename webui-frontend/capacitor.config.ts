import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pixivflow.webui',
  appName: 'PixivFlow',
  webDir: 'dist',
  server: {
    // 开发时可以配置为本地服务器
    // url: 'http://localhost:3000',
    // cleartext: true
  },
  ios: {
    // iOS 特定配置
    scheme: 'PixivFlow',
    // 允许 HTTP 连接（开发时）
    // allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
};

export default config;

