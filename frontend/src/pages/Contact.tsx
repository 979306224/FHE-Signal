import { memo } from 'react';

function Contact() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>联系我们</h1>
      <p>如果您有任何问题或建议，请通过以下方式联系我们：</p>
      <ul>
        <li>邮箱: contact@example.com</li>
        <li>电话: +86 123-4567-8900</li>
        <li>地址: 北京市朝阳区xxx街道</li>
      </ul>
    </div>
  );
}

export default memo(Contact);
