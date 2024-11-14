// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT.

import './App.css';
import '@aws-amplify/ui-react/styles.css';
import React, { useState, useEffect, useReducer, useRef } from 'react';
import { Button } from '@aws-amplify/ui-react';
import { QBusinessClient, ChatSyncCommand, ListConversationsCommand, ListMessagesCommand, ChatMode, DeleteConversationCommand } from "@aws-sdk/client-qbusiness";
import { css } from '@emotion/css';

/*global config*/
const aws_region = config.aws_region;

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;

  return `${month}/${day}/${year} @ ${formattedHours}:${minutes} ${ampm}`;
}

function splitStringByIndices(str, indices) {
    const result = [];
    let start = 0;
    for (const endOffset of indices) {
      result.push(str.slice(start, Number(endOffset)));
      start = endOffset;
    }
    result.push(str.slice(start));
    return result;
}

const insertSystemCitations = (message) => {
    if(message.type === "SYSTEM" && message.hasCitations) {
        let endOffsets = []
        for(let i = 0; i < message.sourceAttribution.length; i++) {
            endOffsets.push(Number(message.sourceAttribution[i].textMessageSegments[0].endOffset))
        }
        let uniqueOffsets = [...new Set(endOffsets)]
        const split = splitStringByIndices(message.body, uniqueOffsets)
        const new_statements = []
        for(let i =0; i < uniqueOffsets.length; i++) {
            let newStatement = `${split[i]}<sup class="CitationNumber">[${i+1}]</sup>`;
            new_statements.push(newStatement)
        }
        new_statements.push(split[split.length-1])
        return new_statements.join(' ').split("\n").join("<br/>")
    } 
    else if (message.type === "USER" ) {
        return '<div>'+message.body+'</div>'
    }
    else {
        return message.body
    }
}

const dedupeAttributions = (attributions) => {
    let newAttributions = []
    for(let i = 0; i < attributions.length; i++) {
        if( newAttributions.indexOf(attributions[i].title) === -1) {
            newAttributions.push(attributions[i])
        } 
    }
    return newAttributions
}

const QChatbot = (props) => {
    const [applicationId, setApplicationId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chatLoading, setChatLoading] = useState(false);
    const [conversations, setConversations] = useState(null)
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const [view, setView] = useState('Conversations');
    const [conversationHistory, setConversationHistory] = useState(null)
    const [userInput, setUserInput] = useState('')
    const [activeConversation, setActiveConversation] = useState(null)
    const divRef = useRef(null);
    const [error, setError] = useState(undefined)
    

    useEffect(() => {
        
        // Function to get a list of conversations
        const getConversationList = async () => {
            // Get current state variables and configure input to chat client
            const input = { // ListConversations Input
                applicationId: props.appId, 
                maxResults: 8
            };
            const command = new ListConversationsCommand(input);
            try {
                const { client } = createClient(props.qCredentials);
                const response = await client.send(command).then(response => {
                    setConversations(response.conversations.reverse())
                    setLoading(false)
                    
                })
            } catch (err) {
                setError(String(err));
                console.log("Error: " + String(err));
                if ( String(err) == "ExpiredTokenException: The security token included in the request is expired" ) {
                    alert('The Identity-Aware AWS Credentials have expired. Close out of the chatbot and click the refresh credentials button.')
                    props.setStale(true)
                }
            }
        }
        setApplicationId(props.appId);
        getConversationList()
    }, [
        props.qCredentials,
        props.appId
    ]);

    // Function to get the current user's credentials and create a client connection
    const createClient = (qCredentials) => {
        try {
            const client = new QBusinessClient({ region: aws_region, credentials: {
                secretAccessKey: qCredentials.secretAccessKey,
                accessKeyId: qCredentials.accessKeyId,
                sessionToken: qCredentials.sessionToken
            }});
            return { client: client }
        }   catch (error) {
            console.log('error', error)
            if ( String(error) == "ExpiredTokenException: The security token included in the request is expired" ) {
                alert('The Identity-Aware AWS Credentials have expired. Close out of the chatbot and click the refresh credentials button.')
                props.setStale(true)
            }
        }
    }
    
    // Function to delete a conversation
    const deleteConversation = async (conversation) => {
        // Get current state variables and configure input to chat client
        setLoading(true)
        const input = { // ListConversations Input
            applicationId: props.appId, 
            conversationId: conversation.conversationId
        };
        const command = new DeleteConversationCommand(input);
        try {
            const { client } = createClient(props.qCredentials);
            const response = await client.send(command).then(() => {
                let newConversations = conversations
                const index = conversations.indexOf(conversation)
                
                if (index > -1) {
                    newConversations.splice(index, 1)
                }
                
                setConversations(newConversations)
                setLoading(false)
                
            })
        } catch (err) {
            setError(String(err));
            alert('The Identity-Aware AWS Credentials have expired. Close out of the chatbot and click the refresh credentials button.')
            props.setStale(true)
        }
    }

    

    // Function to get the conversation history
    const getConversationHistory = async (conversationId) => {
        setLoading(true)
        setActiveConversation(conversationId)
        const input = { // ListMessages
            applicationId: applicationId, // required
            conversationId: conversationId,
            maxResults: 30,
        };

        const command = new ListMessagesCommand(input);

        try {
            const { client } = createClient(props.qCredentials);
            const response = await client.send(command).then(response => {
                setView('Chat')

                // make this so that citationsExist param is set if true

                let conversationHist = response.messages.reverse()
                for(let i = 0; i< conversationHist.length;i++) {
                    if(conversationHist[i].type === "SYSTEM") {
                        // determine if message has citations
                        if(conversationHist[i].sourceAttribution === undefined) { //here
                            conversationHist[i].hasCitations = false
                        } else {
                            conversationHist[i].hasCitations = true
                        }
                    }
                }

                setConversationHistory(conversationHist)


                forceUpdate()
                setLoading(false)
            })
        } catch (err) {
            setError(String(err));
            alert('The Identity-Aware AWS Credentials have expired. Close out of the chatbot and click the refresh credentials button.')
            props.setStale(true)
            
        }
    }

    // Function to handle user chat input
    const chat = async (conversationId, messageId, question) => {
        console.log('Message to be sent', question)
        const input = { 
            applicationId: props.appId,
            userMessage: question,
            chatMode: ChatMode.RETRIEVAL_MODE
        };
        console.log('Full Input Body',input)
        // Assign conversation id if it exists.
        if (conversationId) {
            input.conversationId = conversationId;
            input.parentMessageId = messageId;
        }
        const command = new ChatSyncCommand(input);
        let timenow = new Date()

        try {
            const { client } = createClient(props.qCredentials);
            const response = await client.send(command).then(response => {
                console.log('Response Received - Full', response)
                console.log('Response - systemMessage', response.systemMessage)
                switch (conversationId) {
                    case null:
                        setActiveConversation(response.conversationId)
                        let newUserMessageNew = {
                            body: userInput,
                            messageId: response.userMessageId,
                            time: timenow,
                            type: "USER"
                        }
        
                        let newConversation = []
                        newConversation.push(newUserMessageNew)
        
                        let newSystemMessageNew = {
                            body: response.systemMessage,
                            messageId: response.systemMessageId,
                            time: timenow,
                            type: "SYSTEM",
                            sourceAttribution: response.sourceAttributions === undefined ? [] : response.sourceAttributions,
                            hasCitations: response.sourceAttributions === undefined ?  false : true
                        }

                        newConversation.push(newSystemMessageNew)
        
                        setConversationHistory(newConversation)
                        // also update conversations
                        let newConv = {
                            conversationId: response.conversationId,
                            startTime: timenow,
                            title: userInput
                        }
                        let newConversations = conversations
                        newConversations.push(newConv)
                        setConversations(newConversations)
                        
                        setUserInput('')
                        break;
                    case !null:
                        
                        break
                    default:
                        let newUserMessage = {
                            body: userInput,
                            messageId: response.userMessageId,
                            time: timenow,
                            type: "USER"
                        }
        
                        let newHistory = conversationHistory
                        newHistory.push(newUserMessage)
        
                        let newSystemMessage = {
                            body: response.systemMessage,
                            messageId: response.systemMessageId,
                            time: timenow,
                            type: "SYSTEM",
                            sourceAttribution: dedupeAttributions(response.sourceAttributions), //this is making it undefined
                            hasCitations: response.sourceAttributions === undefined ? false : true
                        }
                        newHistory.push(newSystemMessage)
                        setConversationHistory(newHistory)
                        setUserInput('')
                        break
                }
            })
            setChatLoading(false)
        } catch (err) {
            setError(String(err));
            console.log();
            if ( String(err) == "ExpiredTokenException: The security token included in the request is expired" ) {
                alert('The Identity-Aware AWS Credentials have expired. Close out of the chatbot and click the refresh credentials button.')
                props.setStale(true)
            } else {
                alert(String(err))
            }
        }
    }

    const handleSendPrompt = () => {
        // grab last messageId from activeConversation to send asMessageId
        if(activeConversation !== 'New') {
            const messageId = conversationHistory[conversationHistory.length - 1].messageId
            chat(activeConversation, messageId, userInput)
            setChatLoading(true)
        } else if(activeConversation === 'New') {
            chat(null, '', userInput)
            setChatLoading(true)
        }
    }

    const handleStartNewConversation = () => {
        setView('Chat')
        setConversationHistory(null)
        setActiveConversation('New')
    }
    
    const handleGoBack = () => {
        setView('Conversations')
        setConversationHistory(null)
        setActiveConversation(null)
    }

    const dedupeAllAttributions = (attributions) => {
        let newAttributions = []

        for(let i = 0; i < attributions.length; i++) {
            let existsInNew = false
            for (let f=0; f < newAttributions.length; f++) {
                if (newAttributions[f].title === attributions[i].title) {
                    existsInNew = true
                }
            }
            if(!existsInNew) {
                newAttributions.push(attributions[i])
            }
        }
        for(let i = 0;i<newAttributions.length;i++) {
            newAttributions[i].citationNumber = i+1
        }
        return newAttributions
    }

    return (
        <div className="ChatbotOuterModal">
            <div className="ChatbotInnerModal">
                <div className="ChatbotHeader">
                    <h4>
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
                    </h4>
                    <h4 className="alt">
                        {!loading && view === 'Chat' &&
                            <div className="ModalButtonBack" onClick={() => handleGoBack()}>
                                <svg className="closeModal" viewBox="0 0 24 24">
                                    <path d="M21 11.016v1.969h-14.156l3.563 3.609-1.406 1.406-6-6 6-6 1.406 1.406-3.563 3.609h14.156z"></path>
                                </svg>
                            </div>
                        }
                        <div className="ModalButtonClose" onClick={props.closeModal}>
                            <svg className="closeModal" viewBox="0 0 20 20">
                                <path d="M2.93 17.070c-1.884-1.821-3.053-4.37-3.053-7.193 0-5.523 4.477-10 10-10 2.823 0 5.372 1.169 7.19 3.050l0.003 0.003c1.737 1.796 2.807 4.247 2.807 6.947 0 5.523-4.477 10-10 10-2.7 0-5.151-1.070-6.95-2.81l0.003 0.003zM4.34 15.66c1.449 1.449 3.45 2.344 5.66 2.344 4.421 0 8.004-3.584 8.004-8.004 0-2.21-0.896-4.211-2.344-5.66v0c-1.449-1.449-3.45-2.344-5.66-2.344-4.421 0-8.004 3.584-8.004 8.004 0 2.21 0.896 4.211 2.344 5.66v0zM14.24 7.17l-2.83 2.83 2.83 2.83-1.41 1.41-2.83-2.83-2.83 2.83-1.41-1.41 2.83-2.83-2.83-2.83 1.41-1.41 2.83 2.83 2.83-2.83 1.41 1.41z"></path>
                            </svg>
                        </div>
                    </h4>
                </div>
                    { loading &&
                        <div className="RippleContainer">
                            <div className="lds-ripple"><div></div><div></div></div>
                        </div>
                    }
                    {!loading && view === 'Conversations' &&
                        <div className="ChatConversationsContainer Conversations">
                            {conversations.length !== 0 &&
                                conversations.map((conversation) => (
                                    <div key={conversation.conversationId + "_link"} className="ConversationButtonContainer">
                                        <Button className="ConversationButton" onClick={() => getConversationHistory(conversation.conversationId, conversation.title)}>
                                            <div className="ConversationTitle">{conversation.title.substring(0,48)}{conversation.title.length > 48 ? ' ...':''}</div>
                                            <div className="Time">{formatDate(conversation.startTime)}</div>
                                        </Button>
                                        <Button className="TrashContainer" onClick={() => deleteConversation(conversation)}>
                                            <svg viewBox="0 0 32 32">
                                                <path d="M4 10v20c0 1.1 0.9 2 2 2h18c1.1 0 2-0.9 2-2v-20h-22zM10 28h-2v-14h2v14zM14 28h-2v-14h2v14zM18 28h-2v-14h2v14zM22 28h-2v-14h2v14z"></path>
                                                <path d="M26.5 4h-6.5v-2.5c0-0.825-0.675-1.5-1.5-1.5h-7c-0.825 0-1.5 0.675-1.5 1.5v2.5h-6.5c-0.825 0-1.5 0.675-1.5 1.5v2.5h26v-2.5c0-0.825-0.675-1.5-1.5-1.5zM18 4h-6v-1.975h6v1.975z"></path>
                                            </svg>
                                        </Button>
                                    </div>
                                ))
                            
                            }
                            {!loading && view === 'Conversations' && conversations.length === 0 &&
                                <div className="ConversationNull">
                                    There are no existing conversations. Click the button below to start a new conversation.
                                </div>
                            }
                            </div>
                    }
                    {!loading && view === 'Chat' && conversationHistory !== null &&
                        <div className="ChatConversationsContainer Chat">
                            {conversationHistory && conversationHistory.map((message) => (
                                <div key={message.messageId + "_chat"} className={"MessageContainer_"+message.type}>
                                    <div  className={'ChatMessage_'+message.type} dangerouslySetInnerHTML={{__html: insertSystemCitations(message)}} />
                                    <div className="MessageDateTime">{formatDate(message.time.toString())}</div>
                                    {message.type === "SYSTEM" && message.hasCitations &&
                                        <div className="SourceAttributions">
                                            {dedupeAllAttributions(message.sourceAttribution).map((source) => (
                                                <div key={source.citationNumber + source.title} className="SourceAttribution">
                                                    <p>[{source.citationNumber}]&nbsp;</p>
                                                    <a target="_blank" rel="noreferrer" href={source.url}>{source.title.substring(0,50)}{source.title.length > 50 ? ' ...':''}</a>
                                                </div>
                                            ))
                                            }
                                        </div>
                                    }
                                </div>
                            ))}
                            <div className='ChatMessage_SYSTEM_SPACING'></div>
                        </div>
                    }
                    {!loading && view === 'Chat' && activeConversation === 'New' &&
                        <div className="ChatConversationsContainer Chat">
                            <div className='ChatMessage_SYSTEM'>You've started a new conversation. Submit your question to begin.</div>
                        </div>
                    }
                {!loading && view === 'Conversations' &&
                    <Button className="NewConversation" onClick={() => handleStartNewConversation()}>Start a new conversation</Button>
                }
                {!loading && view === 'Chat' &&
                    <div className="ChatInputContainer">
                        <input type="text" placeholder='Type your question here.' value={userInput} onChange={e => setUserInput(e.target.value)} />
                        { !chatLoading &&
                            <Button className="SubmitSendButton" onClick={() => handleSendPrompt()} disabled={userInput.length < 5}>
                                <svg style={{ fill: userInput.length < 5 ? 'grey': 'rgb(5, 160, 209)'  }} viewBox="0 0 20 20">
                                    <path d="M18.64 2.634c-0.344 0.121-17.321 6.104-17.656 6.222-0.284 0.1-0.347 0.345-0.010 0.479 0.401 0.161 3.796 1.521 3.796 1.521v0l2.25 0.901c0 0 10.838-7.958 10.984-8.066 0.148-0.108 0.318 0.095 0.211 0.211s-7.871 8.513-7.871 8.513v0.002l-0.452 0.503 0.599 0.322c0 0 4.65 2.504 4.982 2.682 0.291 0.156 0.668 0.027 0.752-0.334 0.099-0.426 2.845-12.261 2.906-12.525 0.079-0.343-0.148-0.552-0.491-0.431zM7 17.162c0 0.246 0.139 0.315 0.331 0.141 0.251-0.229 2.85-2.561 2.85-2.561l-3.181-1.644v4.064z"></path>
                                </svg>
                            </Button>
                        }
                        { chatLoading &&
                        <div className="ChatLoadingContainer">
                            <div className="lds-ripple"><div></div><div></div><div></div></div>
                        </div>
                    }
                    </div>
                }
                {error !== null &&
                    <div className="ErrorModal">
                        <div className="ErrorModalHeader">
                            <div className="ModalButtonClose" onClick={setError(null)}>
                                <svg className="closeModal" viewBox="0 0 20 20">
                                    <path d="M2.93 17.070c-1.884-1.821-3.053-4.37-3.053-7.193 0-5.523 4.477-10 10-10 2.823 0 5.372 1.169 7.19 3.050l0.003 0.003c1.737 1.796 2.807 4.247 2.807 6.947 0 5.523-4.477 10-10 10-2.7 0-5.151-1.070-6.95-2.81l0.003 0.003zM4.34 15.66c1.449 1.449 3.45 2.344 5.66 2.344 4.421 0 8.004-3.584 8.004-8.004 0-2.21-0.896-4.211-2.344-5.66v0c-1.449-1.449-3.45-2.344-5.66-2.344-4.421 0-8.004 3.584-8.004 8.004 0 2.21 0.896 4.211 2.344 5.66v0zM14.24 7.17l-2.83 2.83 2.83 2.83-1.41 1.41-2.83-2.83-2.83 2.83-1.41-1.41 2.83-2.83-2.83-2.83 1.41-1.41 2.83 2.83 2.83-2.83 1.41 1.41z"></path>
                                </svg>
                            </div>
                        </div>
                        <div className="ErrorModalBody">
                            {error}
                        </div>
                    </div>
                }
            </div>
        </div>
    );
}

export default QChatbot;
