import { refineFrancCode } from '../../utils/language-detection';

describe('refineFrancCode（中日文误判修正）', () => {
  it('把 franc 误判为日文的中文正文修正为 cmn', () => {
    // Pixiv 中文小说常见：正文中文，混入日文标签/角色名/拟声词
    const text = '山间的天气一天天暖了起来，她知道这是旅行的好时机。'
      + 'これは本です。她感到十分轻松，每天都期待着与朋友一起登山。'
      + '她轻轻闭上眼睛，感受着山间的清风，嘴角不自觉地上扬。';
    expect(refineFrancCode('jpn', text)).toBe('cmn');
  });

  it('保持真日文为 jpn（假名占比高）', () => {
    const text = 'これは私の旅行記です。ある日、私は友達と一緒に小さな山に登りました。'
      + '最初は道がわかりませんでしたが、友達が地図を見ながら案内してくれました。'
      + '山の上から見える景色は、今までに見たことのないほど美しいものでした。';
    expect(refineFrancCode('jpn', text)).toBe('jpn');
  });

  it('不处理非日文判定（cmn/eng/kor 原样返回）', () => {
    expect(refineFrancCode('cmn', '任何文本')).toBe('cmn');
    expect(refineFrancCode('eng', 'some english text')).toBe('eng');
    expect(refineFrancCode('kor', '한국어 텍스트')).toBe('kor');
  });
});
