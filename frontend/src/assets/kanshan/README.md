# 看山 · 知见宇宙图标

基于用户提供的知乎黑客松素材衍生设计，使用内置 image_gen 生成和修订。
官方角色参考来自 `看山三视图.zip` 的 `33f11967cc145627560c3db70c7d3ab8.jpg`；
同时检查了 `刘看山动态.zip` 中的电脑、打招呼素材。角色归属与使用范围沿用赛事素材约定，
本目录不对原角色另行声明开源授权。

| 文件 | 用途 | 显示尺寸 |
| --- | --- | --- |
| guide.webp | 入口领航、生成末阶段、错误停靠 | 64–96px |
| analyze.webp | 生成等待、游客提交中 | 56–112px |
| discover.webp | 游客选择探索方向 | 72–112px |

均为 384 × 384 WebP，质量 88，总计约 24KB。源图由 image_gen 完成视觉处理，
使用 cwebp 缩放与编码。图片是**不透明深靛底**，不是透明 PNG；首轮生成的棋盘纹已由
image_gen 替换。`KanshanIcon.css` 仅柔化外缘，适用于当前深色界面，不应直接用于浅色主题。
角色不代替恒星、问题行星、答案卫星或文章探测器的实体符号。
图标保持静态、固定宽高、装饰性空 alt，操作和真实进度均由原有文字承担。

## 生成提示词

共同提示词（参考图为官方三视图）：

> Use case: identity-preserve. Create one standalone compact UI mascot icon for Mindverse, a quiet knowledge observatory based on Zhihu. Reference image is the official Liu Kanshan identity: preserve exactly its elongated white body with two pointed ears, enormous round black nose, tiny black eyes, slender black arms and legs. Premium soft 3D clay miniature matching reference, subtle blue rim light to remain readable on a dark indigo interface. Full body centered, fills 85% of square canvas, clean readable silhouette at 96px. Restrained desaturated star blue and tiny warm amber accents on prop only. Actual transparent alpha background, no backdrop, no floor, no text, no labels, no watermark, no badge, no frame.

各图追加：

- guide: The character gently holds an unfolded dark star-blue celestial map in both hands, a few simple amber star dots on map, looking curiously toward viewer. One map only, no other floating objects.
- analyze: The character sits working on one small desaturated star-blue laptop, screen facing character, back toward viewer at three-quarter angle; one small amber star engraved on laptop lid. Calm focused pose. Keep huge nose clearly visible.
- discover: The character stands holding one simple desaturated star-blue magnifying glass beside its face, leaning forward curiously, lens clear, entire face and nose unobscured. No extra props.

最终修订提示词（分别以上一步的对应生成图为参考）：

> Edit this image. Keep the Liu Kanshan character and its prop absolutely unchanged. Replace ALL checkerboard background with a perfectly flat solid dark indigo #080B14 background. This is an opaque icon for a dark UI. NO checkerboard anywhere, no fabric, no texture, no gradients, no shadows on background, no text. Include any gaps between limbs and inside magnifying glass lens. Character fills same square framing. All empty background pixels must be solid #080B14.
