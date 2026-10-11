## 使用方法

### 前置条件
- 提前在网易大神app-领券页面-任意点击领券绑定手机号
- 根据 passport.example.json 创建 passport.json文件
- 安装nodejs, 安装npm依赖
```bash
npm install
```
- 进入[会员中心](https://vip.ds.163.com/partner-perks), 使用手机号登录, 提取cookie的NTES_YD_PASSPORT字段放进passport.jsonc文件里面的数组里
  - 登录方法：点击“我的领券”
  - Cookie获取方法，使用浏览器f12：
  ![pK0Jxtt7svfDQZTuE3odWZqPlZZ1qShS.webp](https://cdn.nodeimage.com/i/pK0Jxtt7svfDQZTuE3odWZqPlZZ1qShS.webp)

### 使用方法(简易), 具体实现请看index.ts末尾注释
```bash
npx tsx index.ts
```