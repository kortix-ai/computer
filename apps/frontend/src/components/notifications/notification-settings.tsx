'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Mail, Smartphone, MessageSquare, CreditCard, Star, Settings as SettingsIcon, Globe, CheckCircle2, XCircle, AlertTriangle, HelpCircle, ShieldCheck, Volume2, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/lib/toast';
import { notificationAPI, type NotificationSettings } from '@/lib/api/notifications';
import { isCloudMode } from '@/lib/config';
import { useWebNotificationStore } from '@/stores/web-notification-store';
import { isNotificationSupported, sendWebNotification } from '@/lib/web-notifications';

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isCloudMode()) {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await notificationAPI.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      toast.error('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    if (!settings) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      setSaving(true);
      await notificationAPI.updateSettings({ [key]: value });
      toast.success('Settings updated');
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error('Failed to update settings');
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  const testNotification = async () => {
    try {
      await notificationAPI.sendTestNotification(
        'Test Notification',
        'This is a test notification from Kortix. If you see this, your notifications are working!'
      );
      toast.success('Test notification sent!');
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast.error('Failed to send test notification');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
        </Card>
        <BrowserNotificationSettings />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        {isCloudMode() && (
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Failed to load settings</CardDescription>
            </CardHeader>
          </Card>
        )}
        <BrowserNotificationSettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>
            Choose how you want to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="email-enabled" className="font-medium">
                  Email Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
            </div>
            <Switch
              id="email-enabled"
              checked={settings.email_enabled}
              onCheckedChange={(checked) => updateSetting('email_enabled', checked)}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="in-app-enabled" className="font-medium">
                  In-App Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  See notifications in the app
                </p>
              </div>
            </div>
            <Switch
              id="in-app-enabled"
              checked={settings.in_app_enabled}
              onCheckedChange={(checked) => updateSetting('in_app_enabled', checked)}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="push-enabled" className="font-medium">
                  Push Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications on your devices
                </p>
              </div>
            </div>
            <Switch
              id="push-enabled"
              checked={settings.push_enabled}
              onCheckedChange={(checked) => updateSetting('push_enabled', checked)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Notification Types
          </CardTitle>
          <CardDescription>
            Control which types of notifications you receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="task-notifications" className="font-medium">
                  Task Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Task completions, failures, and updates
                </p>
              </div>
            </div>
            <Switch
              id="task-notifications"
              checked={settings.task_notifications}
              onCheckedChange={(checked) => updateSetting('task_notifications', checked)}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="billing-notifications" className="font-medium">
                  Billing Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Payments, subscriptions, and credits
                </p>
              </div>
            </div>
            <Switch
              id="billing-notifications"
              checked={settings.billing_notifications}
              onCheckedChange={(checked) => updateSetting('billing_notifications', checked)}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="promotional-notifications" className="font-medium">
                  Promotional Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  New features, tips, and special offers
                </p>
              </div>
            </div>
            <Switch
              id="promotional-notifications"
              checked={settings.promotional_notifications}
              onCheckedChange={(checked) => updateSetting('promotional_notifications', checked)}
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="system-notifications" className="font-medium">
                  System Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Important system updates and alerts
                </p>
              </div>
            </div>
            <Switch
              id="system-notifications"
              checked={settings.system_notifications}
              onCheckedChange={(checked) => updateSetting('system_notifications', checked)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test Notifications</CardTitle>
          <CardDescription>
            Send a test notification to verify your settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={testNotification} variant="outline">
            Send Test Notification
          </Button>
        </CardContent>
      </Card>

      <BrowserNotificationSettings />
    </div>
  );
}

// ============================================================================
// Browser (Web) Notification Settings
// ============================================================================

export function BrowserNotificationSettings() {
  const permission = useWebNotificationStore((s) => s.permission);
  const preferences = useWebNotificationStore((s) => s.preferences);
  const toggleEnabled = useWebNotificationStore((s) => s.toggleEnabled);
  const setPreference = useWebNotificationStore((s) => s.setPreference);
  const syncPermission = useWebNotificationStore((s) => s.syncPermission);

  // Sync permission on mount (in case user changed it in browser settings)
  useEffect(() => {
    syncPermission();
  }, [syncPermission]);

  const supported = isNotificationSupported();

  const sendTestBrowserNotification = () => {
    sendWebNotification({
      type: 'completion',
      title: 'Test Browser Notification',
      body: 'Browser notifications are working correctly!',
      tag: 'test',
    }, true);
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Browser Notifications
          </CardTitle>
          <CardDescription>
            Your browser does not support web notifications.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Browser Notifications
          </CardTitle>
          <CardDescription>
            Get notified in your browser when tasks complete, errors occur, or Kortix needs your input
            {permission === 'denied' && (
              <span className="block mt-1 text-destructive text-xs">
                Browser notifications are blocked. Please allow them in your browser settings.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="web-notif-enabled" className="font-medium">
                  Enable Browser Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  {permission === 'granted'
                    ? 'Permission granted'
                    : permission === 'denied'
                      ? 'Permission denied by browser'
                      : 'Will request permission when enabled'}
                </p>
              </div>
            </div>
            <Switch
              id="web-notif-enabled"
              checked={preferences.enabled}
              onCheckedChange={() => toggleEnabled()}
              disabled={permission === 'denied'}
            />
          </div>

          {preferences.enabled && (
            <>
              <Separator />

              {/* Task completions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-completion" className="font-medium">
                      Task Completions
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When a session finishes its task
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-completion"
                  checked={preferences.onCompletion}
                  onCheckedChange={(checked) => setPreference('onCompletion', checked)}
                />
              </div>

              <Separator />

              {/* Errors */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-error" className="font-medium">
                      Errors
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When a session encounters an error
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-error"
                  checked={preferences.onError}
                  onCheckedChange={(checked) => setPreference('onError', checked)}
                />
              </div>

              <Separator />

              {/* Questions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HelpCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-question" className="font-medium">
                      Questions
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When Kortix needs your input to continue
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-question"
                  checked={preferences.onQuestion}
                  onCheckedChange={(checked) => setPreference('onQuestion', checked)}
                />
              </div>

              <Separator />

              {/* Permission requests */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-permission" className="font-medium">
                      Permission Requests
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When Kortix needs permission to use a tool
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-permission"
                  checked={preferences.onPermission}
                  onCheckedChange={(checked) => setPreference('onPermission', checked)}
                />
              </div>

              <Separator />

              {/* Only when tab hidden */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-hidden" className="font-medium">
                      Only When Tab is Hidden
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Only show browser notifications when you&apos;re on another tab
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-hidden"
                  checked={preferences.onlyWhenHidden}
                  onCheckedChange={(checked) => setPreference('onlyWhenHidden', checked)}
                />
              </div>

              <Separator />

              {/* Sound */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="web-notif-sound" className="font-medium">
                      Notification Sound
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Play a sound when a notification is sent
                    </p>
                  </div>
                </div>
                <Switch
                  id="web-notif-sound"
                  checked={preferences.playSound}
                  onCheckedChange={(checked) => setPreference('playSound', checked)}
                />
              </div>

              <Separator />

              {/* Test button */}
              <div className="pt-1">
                <Button onClick={sendTestBrowserNotification} variant="outline" size="sm">
                  Send Test Browser Notification
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
