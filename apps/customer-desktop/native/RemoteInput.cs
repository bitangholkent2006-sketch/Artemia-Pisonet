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

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

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

