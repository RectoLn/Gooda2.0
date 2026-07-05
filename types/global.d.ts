/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production',
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'qq' | 'jd' | 'harmony' | 'jdrn'
    TARO_APP_ID: string
    /** Gooda 后端 SPU 代理地址（转发官方 OpenAPI /spu/v1/*）。不配置 → SPU 资料库显示未配置态 */
    TARO_APP_SPU_PROXY_BASE?: string
    /** '1' 时 H5 构建强制启用 SPU mock 数据（仅开发验证用） */
    TARO_APP_SPU_MOCK?: string
  }
}

declare module '@tarojs/components' {
  export * from '@tarojs/components/types/index.vue3'
}
