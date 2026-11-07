// happy-dom の canvas は 2D コンテキストを返さない。
// three.js のテクスチャを作る処理（src/scene/textures.js）が動くよう、描画命令を受け流す代用品に差し替える
function createContextStub() {
  const gradient = { addColorStop() {} };
  const overrides = {
    measureText: (text) => ({ width: String(text).length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return new Proxy(
    {},
    {
      get: (target, prop) => (prop in target ? target[prop] : (overrides[prop] ?? (() => {}))),
      set: (target, prop, value) => {
        target[prop] = value;
        return true;
      },
    },
  );
}

HTMLCanvasElement.prototype.getContext = function getContext() {
  this.contextStub ??= createContextStub();
  return this.contextStub;
};
