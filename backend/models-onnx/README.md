# 抠图模型（不入 git，部署时随 backend zip 上传）

`/cutout/v1/*` 使用的 ONNX 模型。二进制被 `.gitignore` 排除（`backend/models-onnx/*.onnx`），
本地重建按下面步骤可完全复现。**两个模型许可证均允许商用。**

| 文件 | 用途 | 许可证 | 大小 | sha256 |
| ---- | ---- | ------ | ---- | ------ |
| `isnet-general-use.int8.onnx` | 主模型（DIS/ISNet，1024²，int8 动态量化） | Apache-2.0 | ~46MB | `f1b1c6f7656e532627697afc989d953be1e7ef8f55a718f3611e8c9fd50cdef7` |
| `u2netp.onnx` | 降级模型（U²-Net 小版，320²，fp32） | Apache-2.0 | ~4.6MB | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |

## 重建步骤

```bash
# 1. 下载官方 fp32 模型（rembg 项目托管，上游 xuebinqin/DIS 与 xuebinqin/U-2-Net）
curl -L -o isnet-general-use.onnx \
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
# fp32 sha256: 60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a
curl -L -o u2netp.onnx \
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx

# 2. int8 动态量化（python3 -m venv + pip install onnx onnxruntime）
python3 - <<'EOF'
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic('isnet-general-use.onnx', 'isnet-general-use.int8.onnx',
                 weight_type=QuantType.QUInt8)
EOF
```

## 部署分片（qdmp 发版单文件 ≤10MB）

qdmp 后端发版对**单个文件**有 10MB 上限，isnet（46MB）需分片随包上传，
服务首次加载时会自动拼回系统临时目录（见 services/cutout.js 的 ensureModelPath）：

```bash
split -b 9437184 isnet-general-use.int8.onnx isnet-general-use.int8.onnx.part-
```

打部署 zip 时排除整文件 `isnet-general-use.int8.onnx`、保留 `*.part-*`；
本地开发放整文件即可（有整文件时优先直用）。u2netp 4.6MB 不需要分片。

选型记录（2026-07）：int8 与 fp32 掩码 IoU 0.94–0.996、肉眼无差；fp16（91MB）虽推理略快，
但加上 u2netp 后 backend zip 逼近 qdmp 100MB 上限、无余量，故选 int8（46MB）。
BiRefNet（MIT）质量更高但 CPU 推理 10s+ 且超包限，留作 GPU 配额下的升级路径。
RMBG-1.4/2.0 仅限非商用，排除。
