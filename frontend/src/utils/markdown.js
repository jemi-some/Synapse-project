// 마크다운 처리 유틸리티
export function parseMarkdown(text) {
  if (!text) return ''
  
  return text
    // **굵은텍스트** -> <strong>굵은텍스트</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // *기울임텍스트* -> <em>기울임텍스트</em>
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 줄바꿈 -> <br>
    .replace(/\n/g, '<br>')
    // 대시 리스트 - 항목 -> <li>항목</li>
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // 숫자 리스트 1. 항목 -> <li>항목</li>  
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // 연속된 <li> 태그들을 <ul>로 감싸기
    .replace(/(<li>.*?<\/li>(\s*<br>)*\s*)+/g, (match) => {
      const listItems = match.replace(/<br>/g, '').trim()
      return `<ul>${listItems}</ul>`
    })
}