// 玩家反馈：把设置里"反馈与建议"填的内容寄到开发者的邮箱。
// 游戏只是一组静态网页，没有自己的服务器，所以借用 Web3Forms 这个转发服务：
// 把内容连同下面的"收件钥匙"发过去，它转成一封邮件寄给钥匙对应的邮箱。
// 钥匙本来就是给网页公开使用的：拿到它只能往那个邮箱寄信，看不到邮箱地址，也读不了信。
// KEY 留空时，设置面板里不出现反馈入口。

const URL = 'https://api.web3forms.com/submit';
const KEY = '1ddd05a6-a7fb-4b19-a0c1-09aafaa36b18';
const COOLDOWN = 30; // 两次发送之间至少隔几秒，免得连点
const TIMEOUT = 15; // 等多少秒没回音就算没发出去

export const MAX_LEN = 2000; // 正文最多几个字
export const MIN_LEN = 4;
export const KINDS = ['bug', 'idea', 'other'];

let last = -Infinity;

export const feedbackOn = () => !!KEY;
export const cooling = () => performance.now() - last < COOLDOWN * 1000;

// kind：KINDS 里的一种；text：正文；contact：玩家留的邮箱（可空）；info：浏览器和游戏进度，方便查问题
// 发出去了返回 true，没发出去返回 false
export async function sendFeedback({ kind, text, contact, info }) {
  const body = {
    access_key: KEY,
    subject: `[栖岛] ${{ bug: '遇到问题', idea: '建议', other: '其他' }[kind] || kind}`,
    from_name: '栖岛玩家反馈',
    message: text.slice(0, MAX_LEN),
    info,
  };
  // 留了邮箱的话，在邮件里直接点"回复"就能回给玩家
  if (contact) body.email = contact.slice(0, 120);
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT * 1000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: stop.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) return false;
    last = performance.now();
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
