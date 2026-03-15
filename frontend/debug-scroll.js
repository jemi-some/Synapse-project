// 브라우저 콘솔에서 실행할 스크롤 디버깅 스크립트
// 사용법: 브라우저 개발자 도구 콘솔에 붙여넣기

console.clear();
console.log('🔍 스크롤 디버깅 시작...\n');

const elements = {
  root: document.querySelector('#root'),
  mainContent: document.querySelector('.main-content'),
  contentScroll: document.querySelector('.content-scroll'),
  routerView: document.querySelector('router-view'),
  imageContainer: document.querySelector('.image-display-container'),
  chatLayout: document.querySelector('.chat-layout'),
  chatBubblesContainer: document.querySelector('.chat-bubbles-container'),
  chatBubbles: document.querySelector('.chat-bubbles')
};

console.log('📊 DOM 요소 존재 여부:');
Object.entries(elements).forEach(([name, el]) => {
  console.log(`  ${el ? '✅' : '❌'} ${name}`);
});

console.log('\n📏 계산된 높이 정보:');

Object.entries(elements).forEach(([name, el]) => {
  if (!el) return;

  const computed = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  console.log(`\n🔹 ${name}:`);
  console.log(`  offsetHeight: ${el.offsetHeight}px`);
  console.log(`  scrollHeight: ${el.scrollHeight}px`);
  console.log(`  clientHeight: ${el.clientHeight}px`);
  console.log(`  BoundingRect height: ${rect.height}px`);
  console.log(`  computed height: ${computed.height}`);
  console.log(`  computed min-height: ${computed.minHeight}`);
  console.log(`  computed max-height: ${computed.maxHeight}`);
  console.log(`  flex: ${computed.flex}`);
  console.log(`  overflow-y: ${computed.overflowY}`);
  console.log(`  position: ${computed.position}`);
  console.log(`  display: ${computed.display}`);
});

console.log('\n🎯 스크롤 가능 여부 체크:');

const contentScroll = elements.contentScroll;
if (contentScroll) {
  const isScrollable = contentScroll.scrollHeight > contentScroll.clientHeight;
  const hasOverflow = window.getComputedStyle(contentScroll).overflowY === 'auto' ||
                      window.getComputedStyle(contentScroll).overflowY === 'scroll';

  console.log(`  contentScroll scrollHeight: ${contentScroll.scrollHeight}px`);
  console.log(`  contentScroll clientHeight: ${contentScroll.clientHeight}px`);
  console.log(`  스크롤 필요? ${isScrollable ? '✅ YES' : '❌ NO'} (${contentScroll.scrollHeight - contentScroll.clientHeight}px 차이)`);
  console.log(`  overflow-y 설정? ${hasOverflow ? '✅ YES' : '❌ NO'}`);

  if (isScrollable && hasOverflow) {
    console.log('  ✅ 스크롤이 작동해야 합니다!');
  } else if (!isScrollable) {
    console.log('  ❌ 문제: 콘텐츠가 컨테이너보다 작습니다.');
  } else if (!hasOverflow) {
    console.log('  ❌ 문제: overflow-y가 설정되지 않았습니다.');
  }
}

console.log('\n🔧 채팅 버블 개수:');
const bubbles = document.querySelectorAll('.chat-bubbles > *');
console.log(`  총 ${bubbles.length}개의 버블`);

console.log('\n💡 문제 진단:');

// 진단 1: .content-scroll의 높이가 고정되어 있는지
if (contentScroll) {
  const csHeight = window.getComputedStyle(contentScroll).height;
  if (csHeight === 'auto' || csHeight === '100%') {
    console.log('  ⚠️  .content-scroll의 높이가 auto/100%입니다. flex: 1이 제대로 작동하지 않을 수 있습니다.');
  }
}

// 진단 2: 부모 컨테이너들의 높이 체인
const checkHeightChain = (el, path = []) => {
  if (!el || el === document.body) return path;
  const computed = window.getComputedStyle(el);
  path.unshift({
    tag: el.tagName.toLowerCase(),
    class: el.className,
    height: computed.height,
    minHeight: computed.minHeight,
    overflow: computed.overflowY
  });
  return checkHeightChain(el.parentElement, path);
};

if (contentScroll) {
  const chain = checkHeightChain(contentScroll);
  console.log('\n  📍 높이 체인 (content-scroll → body):');
  chain.forEach((item, i) => {
    console.log(`    ${i}. <${item.tag}.${item.class}>`);
    console.log(`       height: ${item.height}, min-height: ${item.minHeight}, overflow-y: ${item.overflow}`);
  });
}

// 진단 3: flex 컨테이너 체크
if (elements.chatLayout && elements.chatBubblesContainer) {
  const layoutFlex = window.getComputedStyle(elements.chatLayout).flex;
  const containerFlex = window.getComputedStyle(elements.chatBubblesContainer).flex;

  console.log('\n  📍 Flex 설정:');
  console.log(`    .chat-layout flex: ${layoutFlex}`);
  console.log(`    .chat-bubbles-container flex: ${containerFlex}`);

  if (layoutFlex.includes('1') || containerFlex.includes('1')) {
    console.log('    ⚠️  flex: 1이 감지되었습니다. 이것이 스크롤을 방해할 수 있습니다.');
  }
}

console.log('\n✅ 디버깅 완료!');
console.log('\n📋 다음 단계:');
console.log('  1. 위 정보를 개발자에게 공유');
console.log('  2. "스크롤 필요?"가 NO라면 → 채팅을 더 많이 추가');
console.log('  3. "overflow-y 설정?"이 NO라면 → CSS에 overflow-y: auto 추가');
console.log('  4. flex: 1이 감지되면 → flex: 0 0 auto로 변경');
