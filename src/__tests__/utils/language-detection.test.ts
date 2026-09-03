import { refineFrancCode } from '../../utils/language-detection';

describe('refineFrancCode（中日文误判修正）', () => {
  it('把 franc 误判为日文的中文正文修正为 cmn', () => {
    // Pixiv 中文小说常见：正文中文，混入日文标签/角色名/拟声词
    const text = '她的肚子一天天大了起来，她知道这是生命的奇迹。'
      + 'これはボテ腹です。她感到十分幸福，每天都盼望着新生命的到来。'
      + '她轻轻闭上眼睛，感受着腹中的律动，嘴角不自觉地上扬。';
    expect(refineFrancCode('jpn', text)).toBe('cmn');
  });

  it('保持真日文为 jpn（假名占比高）', () => {
    const text = 'これは私の物語です。ある日、私はお腹が大きくなっていくのを感じました。'
      + '最初は何が起こっているのかわかりませんでしたが、だんだんと幸せな気持ちになっていきました。'
      + 'お腹の中の温かさは、今までに経験したことのないものでした。';
    expect(refineFrancCode('jpn', text)).toBe('jpn');
  });

  it('不处理非日文判定（cmn/eng/kor 原样返回）', () => {
    expect(refineFrancCode('cmn', '任何文本')).toBe('cmn');
    expect(refineFrancCode('eng', 'some english text')).toBe('eng');
    expect(refineFrancCode('kor', '한국어 텍스트')).toBe('kor');
  });
});
