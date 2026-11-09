using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ArtemiaRemoteInput {
    class Program {
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        const uint KEYEVENTF_KEYUP = 0x0002;
        const byte VK_TAB = 0x09;
        const byte VK_MENU = 0x12;    // Alt
        const byte VK_CONTROL = 0x11; // Ctrl
        const byte VK_SHIFT = 0x10;   // Shift
        const byte VK_LWIN = 0x5B;    // Win Key
        const byte VK_ESCAPE = 0x1B;  // Esc
        const byte VK_F4 = 0x73;      // F4
        const byte VK_D = 0x44;       // D
        const byte VK_E = 0x45;       // E
        const byte VK_R = 0x52;       // R

        static void SendKeyCombo(params byte[] vks) {
            foreach (var vk in vks) {
                keybd_event(vk, 0, 0, UIntPtr.Zero);
                Thread.Sleep(10);
            }
            Thread.Sleep(35);
            for (int i = vks.Length - 1; i >= 0; i--) {
                keybd_event(vks[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                Thread.Sleep(10);
            }
        }

        [STAThread]
        static void Main(string[] args) {
            if (args.Length == 0) return;
            string cmd = args[0].ToLower();

            try {
                if (cmd == "click" || cmd == "dclick" || cmd == "rclick" || cmd == "move" || cmd == "down" || cmd == "up") {
                    if (args.Length >= 3) {
                        int x = int.Parse(args[1]);
                        int y = int.Parse(args[2]);
                        SetCursorPos(x, y);

                        if (cmd == "click") {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            Thread.Sleep(25);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        } else if (cmd == "dclick") {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                            Thread.Sleep(50);
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        } else if (cmd == "rclick") {
                            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                            Thread.Sleep(25);
                            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                        } else if (cmd == "down") {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        } else if (cmd == "up") {
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        }
                    }
                } else if (cmd == "scroll" && args.Length >= 2) {
                    int delta = int.Parse(args[1]);
                    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
                } else if (cmd == "alttab" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "alttab" || args[1].ToLower() == "%{tab}"))) {
                    // Windows Native Alt+Tab Window Switcher
                    SendKeyCombo(VK_MENU, VK_TAB);
                } else if (cmd == "win" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "win" || args[1].ToLower() == "start" || args[1].ToLower() == "^{esc}"))) {
                    // Windows Start Menu Key
                    SendKeyCombo(VK_LWIN);
                } else if (cmd == "wind" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "wind" || args[1].ToLower() == "desktop" || args[1].ToLower() == "#d"))) {
                    // Win+D (Show Desktop)
                    SendKeyCombo(VK_LWIN, VK_D);
                } else if (cmd == "wine" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "wine" || args[1].ToLower() == "explorer" || args[1].ToLower() == "#e"))) {
                    // Win+E (File Explorer)
                    SendKeyCombo(VK_LWIN, VK_E);
                } else if (cmd == "altf4" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "altf4" || args[1].ToLower() == "%{f4}"))) {
                    // Alt+F4 (Close active window)
                    SendKeyCombo(VK_MENU, VK_F4);
                } else if (cmd == "taskmgr" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "taskmgr" || args[1].ToLower() == "^+{esc}"))) {
                    // Ctrl+Shift+Esc (Task Manager)
                    SendKeyCombo(VK_CONTROL, VK_SHIFT, VK_ESCAPE);
                } else if (cmd == "key" && args.Length >= 2) {
                    string keyStr = args[1];
                    SendKeys.SendWait(keyStr);
                } else if (cmd == "text" && args.Length >= 2) {
                    string text = string.Join(" ", args, 1, args.Length - 1);
                    SendKeys.SendWait(text);
                }
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
            }
        }
    }
}
