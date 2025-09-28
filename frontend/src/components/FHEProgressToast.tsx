import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Spin, Typography, Space } from '@douyinfe/semi-ui';
import './FHEProgressToast.less';

const { Text } = Typography;

interface FHEProgressToastProps {
  visible: boolean;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  onComplete?: () => void;
}

const FHEProgressToast: React.FC<FHEProgressToastProps> = ({
  visible,
  currentStep,
  totalSteps,
  stepName,
  onComplete
}) => {
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setProgress(0);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && currentStep > 0) {
      const newProgress = (currentStep / totalSteps) * 100;
      setProgress(newProgress);
      
      if (currentStep === totalSteps) {
        // Delay a bit before calling callback when complete
        setTimeout(() => {
          onComplete?.();
        }, 500);
      }
    }
  }, [currentStep, totalSteps, visible, onComplete]);

  if (!visible || !mounted) return null;

  const toastContent = (
    <div className="fhe-progress-toast">
      <div className="fhe-progress-content">
        <Space align="center" spacing="loose">
          <Spin size="small" />
          <div className="fhe-progress-info">
            <Text strong>{stepName}</Text>
            <div className="fhe-progress-bar">
              <div 
                className="fhe-progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <Text type="tertiary" size="small">
              {currentStep} / {totalSteps} Steps
            </Text>
          </div>
        </Space>
      </div>
    </div>
  );

  // Use Portal to render component to body
  return createPortal(toastContent, document.body);
};

export default FHEProgressToast;
