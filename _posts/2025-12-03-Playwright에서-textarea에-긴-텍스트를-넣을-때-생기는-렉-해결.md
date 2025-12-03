---
title: Playwright에서 textarea에 긴 텍스트를 넣을 때 생기는 렉 해결
date: 2025-12-03 12:19:45 +0900
categories: [개발]
tags: [개발]
---


Playwright로 실행한 구글 AI 스튜디오에 긴 텍스트를 붙여넣을 때 생겼던 이슈다.

600kb정도 되는 파일의 내용물을 textarea에 `fill()` 로 집어넣으려 하면 브라우저가 멈춘다.

찾아보니 이미 비슷한 이슈들이 올라와 있다.
- https://github.com/microsoft/playwright/issues/33761
- https://github.com/microsoft/playwright/issues/23077

그렇다면 clipboardy를 사용해서 textarea에 붙여넣기를 하면 렉이 걸릴까 궁금했는데 아래의 코드로 렉 없이 작동했다.

```js
async function writeTextarea(page, text) {
  const { default: clipboard } = await import("clipboardy");

  await clipboard.write(text);
  const textarea = await page.$("textarea");
  await textarea.fill("");
  await textarea.click();
  await page.keyboard.press(`Control+V`);
}
```

Playwright 사용 과정에서 생겼던 사소한 이슈 해결.
