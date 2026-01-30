import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, RefreshCw, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { AppSettings, MobileSetupQRPayload, QR_CODE_EXPIRATION_MS } from '../types';

interface QRCodeGeneratorProps {
  settings: AppSettings;
}

export function QRCodeGenerator({ settings }: QRCodeGeneratorProps) {
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQRCode = useCallback(() => {
    setError(null);

    // Validate that Kimai is configured
    if (!settings.kimai.apiUrl || !settings.kimai.apiToken) {
      setError('Kimai API URL and Token must be configured first');
      return;
    }

    // Use seconds (not milliseconds) for timestamps - Flutter expects seconds
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expirationSeconds = nowSeconds + Math.floor(QR_CODE_EXPIRATION_MS / 1000);

    const payload: MobileSetupQRPayload = {
      v: 1,
      ts: nowSeconds,
      exp: expirationSeconds,
      kimai: {
        url: settings.kimai.apiUrl,
        token: settings.kimai.apiToken,
      },
      // Convert to strings - Flutter expects string array
      fav: (settings.favoriteCustomerIds || []).map(id => id.toString()),
    };

    // Add Jira settings if enabled and configured
    if (settings.jira?.enabled && settings.jira.apiUrl && settings.jira.apiToken) {
      payload.jira = {
        url: settings.jira.apiUrl,
        email: settings.jira.email,
        token: settings.jira.apiToken,
      };
    }

    // Add defaults if configured
    if (settings.useDefaults) {
      const def: MobileSetupQRPayload['def'] = {};
      if (settings.defaultCustomerId) def.cid = settings.defaultCustomerId;
      if (settings.defaultProjectId) def.pid = settings.defaultProjectId;
      if (settings.defaultActivityId) def.aid = settings.defaultActivityId;
      if (Object.keys(def).length > 0) {
        payload.def = def;
      }
    }

    // Encode as base64 JSON (raw base64 without URL prefix)
    const jsonStr = JSON.stringify(payload);
    const base64 = btoa(jsonStr);

    setQrData(base64);
    // Store expiration in milliseconds for UI countdown
    setExpiresAt(expirationSeconds * 1000);
    setShowQR(true);
  }, [settings]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimeLeft = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);

      if (remaining === 0) {
        setShowQR(false);
        setQrData(null);
        setExpiresAt(null);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTimeLeft = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleCopyData = async () => {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRegenerate = () => {
    generateQRCode();
  };

  const isKimaiConfigured = settings.kimai.apiUrl && settings.kimai.apiToken;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Mobile App Setup</CardTitle>
        </div>
        <CardDescription>
          Scan this QR code with the Kimai mobile app to transfer your settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showQR ? (
          <>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="text-sm text-muted-foreground space-y-2">
              <p>The QR code will include:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Kimai connection settings</li>
                {settings.jira?.enabled && <li>Jira connection settings</li>}
                {settings.favoriteCustomerIds?.length > 0 && (
                  <li>{settings.favoriteCustomerIds.length} favorite customer(s)</li>
                )}
                {settings.useDefaults && settings.defaultCustomerId && (
                  <li>Default selections</li>
                )}
              </ul>
            </div>

            <Button
              onClick={generateQRCode}
              disabled={!isKimaiConfigured}
              className="w-full"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Generate QR Code
            </Button>

            {!isKimaiConfigured && (
              <p className="text-xs text-muted-foreground text-center">
                Configure Kimai connection above first
              </p>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {/* QR Code Display */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-lg shadow-sm">
                {qrData && (
                  <QRCodeSVG
                    value={qrData}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                )}
              </div>
            </div>

            {/* Expiration Timer */}
            <div className="text-center">
              <div className={`text-lg font-mono font-semibold ${
                timeLeft < 60000 ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                Expires in: {formatTimeLeft(timeLeft)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                QR code expires for security
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">To scan:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open Kimai mobile app</li>
                <li>Go to Settings</li>
                <li>Tap "Scan QR Code"</li>
                <li>Point camera at this QR code</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyData}
                className="flex-1"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Data
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowQR(false);
                setQrData(null);
                setExpiresAt(null);
              }}
              className="w-full text-muted-foreground"
            >
              Hide QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
