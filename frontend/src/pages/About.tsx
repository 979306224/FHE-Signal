import { memo } from 'react';

function About() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>关于我们</h1>
      <p>这是一个基于FHE（全同态加密）的IPFShare项目。</p>
      <p>我们致力于为用户提供安全、私密的数据分享解决方案。</p>
    </div>
  );
}

export default memo(About);
