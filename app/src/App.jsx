// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT.

import { fetchAuthSession } from "@aws-amplify/auth";
import { Authenticator, Button } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { Amplify } from "aws-amplify";
import React, { useState, useEffect, useCallback } from "react";
import ChildComponent from "./ChildComponent";

/* global config */
const IAM_BROKER_ENDPOINT = config.credential_vendor_api_base_endpoint;
const cognito_userpool_client_id = config.cognito_userpool_client_id;
const cognito_userpool_id = config.cognito_userpool_id;

// Constants
const CREDENTIAL_EXPIRATION_TIME = 3600000; // 1 hour in milliseconds
const CREDENTIAL_REFRESH_THRESHOLD = 300000; // 5 minutes in milliseconds

/**
 * Fetches a token from the IAM Broker
 * @param {string} token - The ID token to use for authentication
 * @returns {Promise<Object>} The response from the IAM Broker
 */
const getToken = async (token) => {
  const settings = {
    method: "POST",
    headers: {
      Authorization: token,
    },
    body: JSON.stringify({ idToken: token }),
  };
  console.log("Making fetch call to API endpoint: ", IAM_BROKER_ENDPOINT);
  try {
    const response = await fetch(IAM_BROKER_ENDPOINT, settings);
    return await response.json();
  } catch (error) {
    console.error("Error fetching token:", error);
    return error;
  }
};

/**
 * Retrieves user credentials using the provided ID token
 * @param {string} idToken - The ID token to use for authentication
 * @returns {Promise<Object>} The user credentials
 */
export const getUserCreds = async (idToken) => {
  const userCreds = await getToken(idToken);
  if (userCreds === undefined) {
    console.error("User credentials are undefined");
  } else if (userCreds.status && userCreds.status.includes("Exception:")) {
    console.error("Exception while renewing token:", userCreds.status);
  }
  console.log("User credentials:", userCreds);
  return userCreds;
};

/**
 * Searches for existing credentials in local storage and checks if they are still valid
 * @returns {Object|null|false} The existing credentials, null if not found, or false if expired
 */
const searchExistingCredentials = () => {
  console.log("Searching for existing credentials");
  const localCredentials = JSON.parse(localStorage.getItem("qCredentials"));
  console.log("Existing credentials:", localCredentials);

  if (!localCredentials) {
    console.log("No local credentials found");
    return null;
  }

  const currentDate = new Date();
  const expirationDate = new Date(localCredentials.expiration);
  const timeDifference = expirationDate.getTime() - currentDate.getTime();
  const minutesRemaining = timeDifference / 60000;

  console.log(`Time remaining: ${minutesRemaining.toFixed(2)} minutes`);

  if (timeDifference < CREDENTIAL_REFRESH_THRESHOLD) {
    console.log("Credentials are expiring soon, removing from local storage");
    localStorage.removeItem("qCredentials");
    return false;
  }

  console.log("Credentials are still valid");
  return localCredentials;
};

//Amplify related functions

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolClientId: cognito_userpool_client_id,
      userPoolId: cognito_userpool_id,
      loginWith: {
        username: "true",
        email: "true",
      },
    },
  },
});

/**
 * Main App component
 * Manages user authentication, credential retrieval, and display
 */
function App() {
  // State variables
  const [displayString, setDisplayString] = useState(""); // Stores the formatted credentials string
  const [qCredentials, setQCredentials] = useState(null); // Stores the user's AWS credentials
  const [credsStale, setCredsStale] = useState(false); // Indicates if the credentials are stale

  // Effect hook to check for existing credentials and handle stale credentials
  useEffect(() => {
    const existingCredentials = searchExistingCredentials();
    if (existingCredentials) {
      setDisplayString(formatCredentialsString(existingCredentials));
      setQCredentials(existingCredentials);
    }

    if (credsStale) {
      console.log("Credentials are now stale. Time to refresh!");
      // TODO: Implement automatic refresh mechanism here
    }
  }, [credsStale]);

  /**
   * Formats the credentials as a string for display and export
   * @param {Object} creds - The credentials object
   * @returns {string} Formatted credentials string
   */
  const formatCredentialsString = (creds) => `
export AWS_ACCESS_KEY_ID=${creds.accessKeyId}
export AWS_SECRET_ACCESS_KEY=${creds.secretAccessKey}
export AWS_SESSION_TOKEN=${creds.sessionToken}`;

  /**
   * Fetches authentication tokens and user credentials
   * Updates state with new credentials and sets up expiration
   */
  const getTokensAndCreds = useCallback(async () => {
    try {
      // Fetch the current authentication session
      const session = await fetchAuthSession();
      console.log("Access Token:", session.tokens.accessToken.toString());
      console.log("ID Token:", session.tokens.idToken.toString());

      // Decode and log token payload
      const arrayToken = session.tokens.idToken.toString().split(".");
      const tokenPayload = JSON.parse(atob(arrayToken[1]));
      console.log("Token Payload:", tokenPayload);

      // Get user credentials
      const creds = await getUserCreds(session.tokens.idToken.toString());

      // Update display string with new credentials
      setDisplayString(formatCredentialsString(creds.credentials));

      if (creds.status && creds.status.indexOf("Exception:") !== -1) {
        console.log("Exception while renewing token. Please log out and back in.");
        return;
      }

      // Set expiration time (1 hour from now)
      creds.credentials.expiration = new Date(Date.now() + CREDENTIAL_EXPIRATION_TIME).toISOString();

      // Update state and local storage
      setQCredentials(creds.credentials);
      localStorage.setItem("qCredentials", JSON.stringify(creds.credentials));
      setCredsStale(false);

      // Set a timeout to mark credentials as stale after 1 hour
      setTimeout(() => {
        setCredsStale(true);
      }, CREDENTIAL_EXPIRATION_TIME);
    } catch (error) {
      console.error("Error fetching tokens and credentials:", error);
    }
  }, [setDisplayString, setQCredentials, setCredsStale]);

  /**
   * Refreshes the user's credentials
   * @returns {Object|null} New credentials or null if refresh failed
   */
  const refreshCredentials = async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens.idToken.toString();
      const newCreds = await getUserCreds(idToken);

      if (newCreds.status && newCreds.status.indexOf("Exception:") !== -1) {
        console.error("Failed to refresh credentials:", newCreds.status);
        return null;
      }

      // Set expiration time (1 hour from now)
      newCreds.credentials.expiration = new Date(Date.now() + CREDENTIAL_EXPIRATION_TIME).toISOString();

      // Update state and local storage
      setQCredentials(newCreds.credentials);
      localStorage.setItem("qCredentials", JSON.stringify(newCreds.credentials));

      // Update the display string
      setDisplayString(formatCredentialsString(newCreds.credentials));

      console.log("Credentials refreshed successfully");
      setCredsStale(false);
      return newCreds.credentials;
    } catch (error) {
      console.error("Error refreshing credentials:", error);
      return null;
    }
  };

  /**
   * Copies the credentials to the clipboard
   */
  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(displayString)
      .then(() => {
        console.log("Credentials copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  };

  /**
   * Handles user sign out
   * Clears credentials and calls the provided signOut function
   * @param {Function} signOut - The sign out function provided by the Authenticator
   */
  const handleSignOut = (signOut) => {
    setQCredentials(null);
    localStorage.removeItem("qCredentials");
    signOut();
  };

  return (
    <Authenticator hideSignUp loginMechanisms={["username"]}>
      {({ signOut, user }) => (
        <main>
          <div className="Header">
            <div className="AuthIndicator">
              <svg viewBox="0 0 32 32">
                <path d="M18 22.082v-1.649c2.203-1.241 4-4.337 4-7.432 0-4.971 0-9-6-9s-6 4.029-6 9c0 3.096 1.797 6.191 4 7.432v1.649c-6.784 0.555-12 3.888-12 7.918h28c0-4.030-5.216-7.364-12-7.918z"></path>
              </svg>
              <p>{user.username}</p>
            </div>
            <Button className="signOut" onClick={() => handleSignOut(signOut)}>
              Sign out
            </Button>
          </div>
          <div className="AppContent">
            <div className="AppContentSection">
              <h3>1. Get Identity-Aware AWS Credentials with Signature V4</h3>

              <p>
                These Identity-Aware credentials can be used in the AWS CloudShell to 
				        interact with Q Business APIs. Alternatively, after they're
                retreived from the API and associated Lambda Function, this
                application will use the credentials to instantiate a
                ChatBot.
              </p>

              <p>Click the "Get Credentials" button to begin.</p>

              <Button
                onClick={getTokensAndCreds}
                disabled={qCredentials !== null}
                className="tooltip-button"
                aria-label="Get Credentials"
              >
                Get Credentials
                <span
                  className="tooltip"
                  style={{ display: qCredentials !== null ? "unset" : "none" }}
                >
                  {qCredentials !== null
                    ? "Credentials already retreived."
                    : "Click to retrieve AWS credentials"}
                </span>
              </Button>

              {credsStale && (
                <Button
                  onClick={refreshCredentials}
                  disabled={!credsStale}
                  className="tooltip-button"
                  aria-label="Refresh Credentials"
                >
                  Refresh Credentials
                </Button>
              )}
            </div>
            {qCredentials !== null && (
              <div className="AppContentSection">
                <h3>2. Working with Identity-Aware AWS Credentials</h3>

                <p>
                  These credentials are temporary and will expire after 1 hour.
                </p>

                <p>
                  Copy the following credentials and paste them into the CloudShell in the AWS Console.
                </p>

                <pre className="code-block">
                  <div className="CodeBlockControls">
                    <button
                      onClick={copyToClipboard}
                      className="tooltip-button"
                      aria-label="Copy to Clipboard"
                    >
                      <svg viewBox="0 0 32 32">
                        <path d="M20 8v-8h-14l-6 6v18h12v8h20v-24h-12zM6 2.828v3.172h-3.172l3.172-3.172zM2 22v-14h6v-6h10v6l-6 6v8h-10zM18 10.828v3.172h-3.172l3.172-3.172zM30 30h-16v-14h6v-6h10v20z"></path>
                      </svg>
                      <span className="tooltip">
                        Copy Credentials to Clipboard
                      </span>
                    </button>
                  </div>
                  <code>{displayString}</code>
                </pre>

                <p>
                  You can use these credentials with AWS CLI or python scripts to invoke
                  Amazon Q Business conversation APIs
                </p>
              </div>
            )}

            {qCredentials !== null && (
              <div className="AppContentSection">
                <h3>3. Interact with Q Business in this Web Application</h3>

                <p>
                  In the source for this web application, we've provided an
                  example of how a ChatBot, powered by Q Business APIs, can be
                  included in a custom application.
                </p>

                <p>
                  To try it out, click the Q button in the bottom-right corner
                  of this application.
                </p>
              </div>
            )}

            {qCredentials !== null && (
              <ChildComponent
                qCredentials={qCredentials}
                setStale={setCredsStale}
              />
            )}
          </div>
        </main>
      )}
    </Authenticator>
  );
}

export default App;
