import "./CreateChannelDialog.less"

import { Button, Form, Modal, Toast } from '@douyinfe/semi-ui';
import { IconUpload } from '@douyinfe/semi-icons';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import type { UploadFile } from '@douyinfe/semi-ui/lib/es/upload/interface';
import { PinataService } from '../services';

type CreateChannelFormValues = {
    name: string;
    description: string;
    logo: string;
    logoFile: UploadFile[];
};

export default function CreateChannelDialog() {

    const [visible, setVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const formApiRef = useRef<FormApi<CreateChannelFormValues> | null>(null);

    const extractFileInstance = useCallback((file: unknown): File | null => {
        if (file instanceof File) {
            return file;
        }
        if (file && typeof file === 'object') {
            const candidate = (file as { fileInstance?: File; file?: { fileInstance?: File } }).fileInstance
                ?? (file as { fileInstance?: File; file?: { fileInstance?: File } }).file?.fileInstance;
            if (candidate instanceof File) {
                return candidate;
            }
        }
        return null;
    }, []);

    const handleLogoBeforeUpload = useCallback((file: unknown) => {
        const realFile = extractFileInstance(file);
        if (!realFile) {
            Toast.error('文件无效');
            return false;
        }
        if (!realFile.type.startsWith('image/')) {
            Toast.error('仅支持上传图片文件');
            return false;
        }
        return true;
    }, [extractFileInstance]);

    const handleOpen = useCallback(() => {
        setVisible(true);
        formApiRef.current?.reset();
    }, []);

    const handleCancel = useCallback(() => {
        if (submitting) {
            return;
        }
        setVisible(false);
        formApiRef.current?.reset();
    }, [submitting]);

    const uploadAction = useMemo(() => ({
        customRequest: async ({ file, fileInstance, onProgress, onError, onSuccess }: {
            file: UploadFile;
            fileInstance?: File;
            onProgress?: (event: { total: number; loaded: number }) => void;
            onError?: (error: Error) => void;
            onSuccess?: (response: unknown, file?: UploadFile) => void;
        }) => {
            const realFile = extractFileInstance(fileInstance ?? (file as UploadFile & { fileInstance?: File }).fileInstance ?? file);
            if (!realFile) {
                onError?.(new Error('无效的文件类型'));
                return;
            }
            try {
                const result = await PinataService.uploadFile(realFile, percent => {
                    onProgress?.({ total: 100, loaded: percent });
                });
                const uploadFile: UploadFile = {
                    uid: file.uid ?? realFile.name,
                    name: realFile.name,
                    status: 'success',
                    url: result.ipfsGatewayUrl,
                    response: result
                };

                formApiRef.current?.setValue('logoFile', [uploadFile]);
                formApiRef.current?.setValue('logo', result.ipfsUri);

                onSuccess?.(result, uploadFile);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Toast.error(message);
                onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        }
    }), [extractFileInstance]);

    const handleSubmit = useCallback(async () => {
        const formApi = formApiRef.current;
        if (!formApi) {
            return;
        }
        setSubmitting(true);
        const values = await formApi.validate();
        const { logoFile, ...rest } = values;
        const submitPayload = {
            ...rest,
            logo: values.logo
        };
        console.log(submitPayload, 'submitPayload');
        // 提交这个json到ipfs
        const result = await PinataService.uploadJson(submitPayload);
        console.log(result, submitting);

        // 
    }, []);


    return <>
        <Modal
            title="创建频道"
            visible={visible}
            onCancel={handleCancel}
            closeOnEsc={!submitting}
            maskClosable={!submitting}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <Button onClick={handleCancel} disabled={submitting}>取消</Button>
                    <Button theme="solid" loading={submitting} onClick={handleSubmit}>
                        确认
                    </Button>
                </div>
            }
        >
            <Form
                labelPosition="top"
                getFormApi={formApi => (formApiRef.current = formApi)}
                initValues={{
                    name: '',
                    description: '',
                    logo: '',
                    logoFile: []
                }}
            >
                <Form.Input
                    field="name"
                    label="频道名称"
                    placeholder="请输入频道名称"
                    rules={[{ required: true, message: '请输入频道名称' }]}
                />
                <Form.TextArea
                    field="description"
                    label="频道描述"
                    placeholder="请输入频道描述"
                    autosize={{ minRows: 3 }}
                />
                <Form.Upload
                    field="logoFile"
                    label="频道 Logo"
                    action=""
                    accept="image/*"
                    limit={1}

                    multiple={false}
                    listType="picture"
                    beforeUpload={handleLogoBeforeUpload}
                    {...uploadAction}
                    dragIcon={<IconUpload style={{ fontSize: 24 }} />}
                    rules={[{ required: true, message: '请上传频道 Logo' }]}
                    onRemove={() => {
                        formApiRef.current?.setValue('logoFile', []);
                        formApiRef.current?.setValue('logo', '');
                    }}
                />
                <div className="infoText" >推荐使用96x96的图片</div>

                <Form.Label>付费计划</Form.Label>
                    <div>

                    </div>

            </Form>
        </Modal>
        <Button theme="solid" onClick={handleOpen} type="primary">创建频道</Button>
    </>
}