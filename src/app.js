import { createApp } from "vue";
import Taro from "@tarojs/taro";

import "./app.scss";

// —— 临时：把白屏时的真实错误弹到设备上，方便无 devtools 定位 ——
let __errShown = false;
function showRuntimeError(tag, err) {
  try {
    const name = (err && err.name) || "";
    const message = (err && err.message) || "";
    const stack = (err && err.stack) || "";
    // 真实原因在 name+message；stack 顶帧是抛错位置（可能被压缩）
    const msg = (name ? name + ": " : "") + message + "\n---\n" + String(stack);
    console.error(tag, msg);
    if (__errShown) return;
    __errShown = true;
    // The on-device modal is a dev aid for diagnosing white screens without
    // devtools. Keep it out of production builds so end users never see a raw
    // stack popup; console.error above still fires everywhere.
    if (process.env.NODE_ENV !== "production") {
      Taro.showModal({
        title: "运行错误 " + tag,
        content: (msg || String(err)).slice(0, 500),
        showCancel: false,
      });
    }
  } catch (e) {}
}

const App = createApp({
  onShow(options) {
    console.log("App onShow.");
  },
  onError(err) {
    showRuntimeError("onError", err);
  },
  onUnhandledRejection(res) {
    showRuntimeError("reject", (res && res.reason) || res);
  },
});

App.config.errorHandler = (err, instance, info) => {
  showRuntimeError("vue:" + (info || ""), err);
};
// 不可删除 修复白屏
const DIMINA_PROXY_GUARD_KEYS = ["xs"];

function patchDiminaSetupState(vm) {
  const setupState = vm && vm.$ && vm.$.setupState;
  if (!setupState || typeof setupState !== "object") return;

  DIMINA_PROXY_GUARD_KEYS.forEach((key) => {
    try {
      const desc = Object.getOwnPropertyDescriptor(setupState, key);
      if (desc && desc.writable) return;

      Object.defineProperty(setupState, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: undefined,
      });
    } catch (error) {
      console.warn("Dimina setupState guard failed:", key, error);
    }
  });
}

App.mixin({
  beforeCreate() {
    patchDiminaSetupState(this);
  },
});
export default App;
