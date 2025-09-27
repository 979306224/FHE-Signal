import { useEffect, useState } from "react";

import "./ChannelList.less"
import { Button } from "@douyinfe/semi-ui"
import CreateChannelDialog from "../components/CreateChannelDialog"
export function ChannelList() {


    return <>
        <div className="container">

            <div className="btn-group">
                <CreateChannelDialog />
            </div>

            <div className="channel-list">

            </div>

        </div>
    </>
}