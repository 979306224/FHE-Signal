import { Button } from '@douyinfe/semi-ui';
import { memo } from 'react';

function Home() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>首页</h1>
      <p>欢迎来到FHE IPFShare应用！</p>
      <Button type="primary">开始使用</Button>
    </div>
  );
}

export default memo(Home);
