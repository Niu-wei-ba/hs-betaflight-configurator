package com.hsfpv.betaflight;

import android.content.Intent;
import android.hardware.usb.UsbManager;
import android.os.Bundle;

import com.hsfpv.betaflight.protocols.serial.BetaflightSerialPlugin;
import com.getcapacitor.BridgeActivity;
import com.hsfpv.betaflight.protocols.tcp.BetaflightTcpPlugin;
import com.hsfpv.betaflight.protocols.ble.BetaflightBlePlugin;
import com.hsfpv.betaflight.protocols.dfu.BetaflightDfuPlugin;
import com.hsfpv.betaflight.file.BetaflightFilePlugin;
import com.hsfpv.betaflight.update.BetaflightAppUpdatePlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetaflightSerialPlugin.class);
    registerPlugin(BetaflightBlePlugin.class);
    registerPlugin(BetaflightTcpPlugin.class);
    registerPlugin(BetaflightDfuPlugin.class);
    registerPlugin(BetaflightFilePlugin.class);
    registerPlugin(BetaflightAppUpdatePlugin.class);

    // If started or recreated by a USB device attachment intent (e.g. the FC
    // re-enumerates after DFU flash), replace it with a plain launcher intent
    // BEFORE super.onCreate → BridgeActivity.load() processes it.
    // USB events are already handled by plugin BroadcastReceivers; without this
    // guard, Capacitor recreates the WebView and the app appears to restart.
    if (getIntent() != null
        && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(getIntent().getAction())) {
      setIntent(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER));
    }

    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    if (intent != null
        && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) {
      setIntent(intent);
      return;
    }
    super.onNewIntent(intent);
  }
}
