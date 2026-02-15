export function markdownToSlack(md: string): string {
  if (!md) return md;

  const codeBlocks: string[] = [];
  let text = md.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK_${codeBlocks.length - 1}\x00`;
  });

  const inlineCode: string[] = [];
  text = text.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `\x00INLINE_${inlineCode.length - 1}\x00`;
  });

  text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  text = text.replace(/__(.+?)__/g, '*$1*');
  text = text.replace(/~~(.+?)~~/g, '~$1~');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');
  text = text.replace(/^[-*_]{3,}$/gm, '───');
  text = text.replace(/\x00INLINE_(\d+)\x00/g, (_, idx) => inlineCode[Number(idx)]);
  text = text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_, idx) => codeBlocks[Number(idx)]);

  return text;
}
