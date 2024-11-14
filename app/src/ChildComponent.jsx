// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT.

import React, { useState, useEffect } from 'react';
import { Button, } from '@aws-amplify/ui-react';
import QChatbot from './QChatbot'

/* global config */
const q_application_id = config.q_application_id;

const ChildComponent = (props) => {
    const [chatModal, setChatModal] = useState(false);

    const closeModal = () => {
        setChatModal(false)
    }

    useEffect(() => {
    }, [
        props.qCredentials
    ]);

    return (
        <div className="QBotChildComponent">
            <Button type="Button" className="QModalButton" onClick={() => setChatModal(!chatModal)}
                style={{
                    display: 'flex'
                }}
            >
                <svg fill="none" viewBox="0 0 48 48">
                    <defs>
                        <linearGradient id="linear-gradient" x1="43.37" y1="-3.59" x2="7.13" y2="48.17" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stopColor="#a7f8ff"></stop>
                            <stop offset=".03" stopColor="#9df1ff"></stop>
                            <stop offset=".08" stopColor="#84e1ff"></stop>
                            <stop offset=".15" stopColor="#5ac7ff"></stop>
                            <stop offset=".22" stopColor="#21a2ff"></stop>
                            <stop offset=".26" stopColor="#008dff"></stop>
                            <stop offset=".66" stopColor="#7f33ff"></stop>
                            <stop offset=".99" stopColor="#39127d"></stop>
                        </linearGradient>
                    </defs>
                    <path d="m20.37.99L5.97,9.3c-2.28,1.32-3.69,3.75-3.69,6.39v16.63c0,2.63,1.41,5.07,3.69,6.39l14.4,8.31c2.28,1.32,5.09,1.32,7.37,0l14.4-8.31c2.28-1.32,3.69-3.75,3.69-6.39V15.69c0-2.63-1.41-5.07-3.69-6.39L27.74.99c-2.28-1.32-5.09-1.32-7.37,0Z" fill="url(#linear-gradient)" strokeWidth="0" color="transparent"></path>
                    <path d="m36.64,14.66l-10.79-6.23c-.49-.29-1.15-.43-1.8-.43s-1.3.14-1.8.43l-10.79,6.23c-.99.57-1.8,1.97-1.8,3.11v12.46c0,1.14.81,2.54,1.8,3.11l10.79,6.23c.49.29,1.15.43,1.8.43s1.3-.14,1.8-.43l10.79-6.23c.99-.57,1.8-1.97,1.8-3.11v-12.46c0-1.14-.81-2.54-1.8-3.11Zm-12.3,22.33s-.14.03-.28.03-.24-.02-.28-.03l-10.82-6.25c-.11-.1-.25-.35-.28-.49v-12.5c.03-.14.18-.39.28-.49l10.82-6.25s.14-.03.28-.03.24.02.28.03l10.82,6.25c.11.1.25.35.28.49v11.09l-8.38-4.84v-1.32c0-.26-.14-.49-.36-.62l-2.28-1.32c-.11-.06-.24-.1-.36-.1s-.25.03-.36.1l-2.28,1.32c-.22.13-.36.37-.36.62v2.63c0,.26.14.49.36.62l2.28,1.32c.11.06.24.1.36.1s.25-.03.36-.1l1.14-.66,8.38,4.84-9.6,5.54Z" fill="#fff" strokeWidth="0" color="transparent"></path>
                </svg>
            </Button>
            {chatModal &&
                <QChatbot 
                    qCredentials={props.qCredentials} 
                    appId={q_application_id} 
                    closeModal={closeModal}  
                    refreshCredentials={props.refreshCredentials}
                    setStale={props.setStale}
                />
            }
        </div>
    );
};

export default ChildComponent;
