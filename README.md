# hlwy-ai-checker
检查第三方AI API是否掺假以及渠道一致

> Fork 改进版 v2.4.0：https://github.com/Yat-mo/hlwy-ai-checker  
> 上游：https://github.com/hanlinwenyuan/hlwy-ai-checker  
> 变更说明：[CHANGELOG-FORK.md](./CHANGELOG-FORK.md)

## 快速开始（改进版）

### Web UI + 本地代理
```bash
python3 -m pip install -r requirements.txt
python3 start.py --no-open
# 浏览器打开 http://127.0.0.1:8000
```

可选参数：`--host` `--port` `--allow-host api.openai.com` `--timeout 60`

建议使用「稳健多探针」套件重新标定后再测第三方渠道。旧基准仅兼容「经典单探针」。

### Headless CLI
```bash
# 查看探针套件 / 预置包
python3 hlwy_check.py suites
python3 hlwy_check.py list-packs

# 用官方 key 标定并导出 pack
export HLWY_API_KEY=sk-...
python3 hlwy_check.py calibrate \
  --name "gpt-4o-official" \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --suite robust \
  --iterations 200 \
  --as-pack \
  -o baselines/official/gpt-4o-robust.json

# 测试第三方渠道
python3 hlwy_check.py test \
  --base-url https://third-party.example/v1 \
  --api-key sk-xxx \
  --model gpt-4o \
  --suite robust \
  --baseline baselines/official/gpt-4o-robust.json

# 多渠道横评
python3 hlwy_check.py compare \
  --channels channels.json \
  --baseline baselines/official/gpt-4o-robust.json \
  --suite robust
```

`channels.json` 示例：
```json
[
  {"name":"中转A","api_type":"openai","base_url":"https://a.example/v1","api_key":"sk-a","model":"gpt-4o"},
  {"name":"中转B","api_type":"openai","base_url":"https://b.example/v1","api_key":"sk-b","model":"gpt-4o"}
]
```

预置 demo 包位于 `baselines/official/`，是 synthetic 数据，只用于离线验证，不是真实官方指纹。详见 [baselines/README.md](./baselines/README.md)。

# 特色&优点

## 识别精确，区分度大
<img width="1463" height="599" alt="069a674bef0a8c3c0e1620c2573fc23d" src="https://github.com/user-attachments/assets/2081fd7c-040d-4512-aff3-755926d893e8" />

<img width="1447" height="607" alt="图片" src="https://github.com/user-attachments/assets/0141405c-7d23-4cf0-bbe6-3e3b8a3e9fce" />

## 一致性好，较少随机因素影响

<img width="1448" height="600" alt="0f64237c164f492dd0d677a97ba981f5" src="https://github.com/user-attachments/assets/07b00a61-ee17-4d39-bb32-8e367d0d03cd" />

## token消耗少

<img width="1663" height="290" alt="图片" src="https://github.com/user-attachments/assets/64e1f1a3-0796-4477-a1c0-1f3b004fdf4d" />

## 标定后再测试，自适应性强

<img width="1513" height="713" alt="图片" src="https://github.com/user-attachments/assets/2d2670b1-72ba-4cd1-9b5e-e3bf6a0d13b7" />

# 使用指南

去releases下载最新稳定版的zip文件，解压， 然后找到start.py，用python打开。

## 1.输入官key进行模型标定（带/v1）

<img width="1354" height="852" alt="图片" src="https://github.com/user-attachments/assets/67ff8592-dcf3-407c-9e12-57991447d016" />

## 2.进行第三方渠道验证

## 3.查看测试结果

# 原理

大语言模型并非真正的随机数生成器。当被要求"随机选数字"时，不同模型由于其训练数据、架构、RLHF对齐方式、tokenization策略等差异，会产生不同的偏差。

这些差异在大量采样后就形成了统计学上可区分的指纹。

这一指纹不能轻易被系统提示词覆盖，所以可以用来检测第三方API是真的假的。

# 免责声明

测试结果仅供参考。

由于大模型本身存在随机性及网络波动，本工具的测试结果不能作为任何商业纠纷、退款索赔的绝对法律/事实依据。

本人仅作为开源代码维护者，不参与、不介入任何用户与 API 提供商之间的商业纠纷。请各方理性交流。

本项目由hanlinwenyuan开发，在Linux Do上发布。

# 友链

[LINUX DO - 新的理想型社区](https://linux.do/)

## Star History

<a href="https://www.star-history.com/?repos=hanlinwenyuan%2Fhlwy-ai-checker&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=hanlinwenyuan/hlwy-ai-checker&type=date&legend=top-left" />
 </picture>
</a>
