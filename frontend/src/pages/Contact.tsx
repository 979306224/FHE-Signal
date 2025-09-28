import { memo } from 'react';

function Contact() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Contact Us</h1>
      <p>If you have any questions or suggestions, please contact us through the following methods:</p>
      <ul>
        <li>Email: contact@example.com</li>
        <li>Phone: +86 123-4567-8900</li>
        <li>Address: xxx Street, Chaoyang District, Beijing</li>
      </ul>
    </div>
  );
}

export default memo(Contact);
