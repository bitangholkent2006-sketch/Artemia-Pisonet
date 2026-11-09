using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
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
        const byte VK_RETURN = 0x0D;  // Enter
        const byte VK_BACK = 0x08;    // Backspace
        const byte VK_SPACE = 0x20;   // Space
        const byte VK_DELETE = 0x2E;  // Delete
        const byte VK_UP = 0x26;
        const byte VK_DOWN = 0x28;
        const byte VK_LEFT = 0x25;
        const byte VK_RIGHT = 0x27;
        const byte VK_F4 = 0x73;      // F4
        const byte VK_D = 0x44;       // D
        const byte VK_E = 0x45;       // E

        static void SendKeyCombo(params byte[] vks) {
            foreach (var vk in vks) {
                keybd_event(vk, 0, 0, UIntPtr.Zero);
                Thread.Sleep(8);
            }
            Thread.Sleep(25);
            for (int i = vks.Length - 1; i >= 0; i--) {
                keybd_event(vks[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                Thread.Sleep(8);
            }
        }

        static ImageCodecInfo GetEncoder(ImageFormat format) {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
            foreach (ImageCodecInfo codec in codecs) {
                if (codec.FormatID == format.Guid) {
                    return codec;
                }
            }
            return null;
        }

        static void CaptureScreen() {
            try {
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
                int targetWidth = 1280;
                int targetHeight = (int)Math.Round((double)bounds.Height * targetWidth / bounds.Width);

                using (Bitmap fullBmp = new Bitmap(bounds.Width, bounds.Height)) {
                    using (Graphics gFull = Graphics.FromImage(fullBmp)) {
                        gFull.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                    }

                    using (Bitmap thumb = new Bitmap(targetWidth, targetHeight)) {
                        using (Graphics gThumb = Graphics.FromImage(thumb)) {
                            gThumb.InterpolationMode = InterpolationMode.Bilinear;
                            gThumb.DrawImage(fullBmp, 0, 0, targetWidth, targetHeight);
                        }

                        using (MemoryStream ms = new MemoryStream()) {
                            ImageCodecInfo encoder = GetEncoder(ImageFormat.Jpeg);
                            EncoderParameters encParams = new EncoderParameters(1);
                            encParams.Param[0] = new EncoderParameter(Encoder.Quality, 65L);
                            thumb.Save(ms, encoder, encParams);
                            byte[] bytes = ms.ToArray();
                            Console.Write("data:image/jpeg;base64," + Convert.ToBase64String(bytes));
                        }
                    }
                }
            } catch (Exception ex) {
                Console.Error.WriteLine("Capture error: " + ex.Message);
            }
        }

        [STAThread]
        static void Main(string[] args) {
            if (args.Length == 0) return;
            string cmd = args[0].ToLower();

            try {
                if (cmd == "capture" || cmd == "screenshot") {
                    CaptureScreen();
                    return;
                }

                if (cmd == "click" || cmd == "dclick" || cmd == "rclick" || cmd == "move" || cmd == "down" || cmd == "up") {
                    if (args.Length >= 3) {
                        int x = int.Parse(args[1]);
                        int y = int.Parse(args[2]);
                        SetCursorPos(x, y);

                        if (cmd == "click") {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            Thread.Sleep(20);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        } else if (cmd == "dclick") {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                            Thread.Sleep(40);
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        } else if (cmd == "rclick") {
                            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                            Thread.Sleep(20);
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
                } else if (cmd == "tab" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "tab" || args[1].ToLower() == "{tab}"))) {
                    SendKeyCombo(VK_TAB);
                } else if (cmd == "enter" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "enter" || args[1].ToLower() == "{enter}"))) {
                    SendKeyCombo(VK_RETURN);
                } else if (cmd == "backspace" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "backspace" || args[1].ToLower() == "{backspace}" || args[1].ToLower() == "{bs}"))) {
                    SendKeyCombo(VK_BACK);
                } else if (cmd == "esc" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "esc" || args[1].ToLower() == "{esc}"))) {
                    SendKeyCombo(VK_ESCAPE);
                } else if (cmd == "space" || (cmd == "key" && args.Length >= 2 && args[1].ToLower() == "space")) {
                    SendKeyCombo(VK_SPACE);
                } else if (cmd == "delete" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "delete" || args[1].ToLower() == "{delete}"))) {
                    SendKeyCombo(VK_DELETE);
                } else if (cmd == "up" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "up" || args[1].ToLower() == "{up}"))) {
                    SendKeyCombo(VK_UP);
                } else if (cmd == "down" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "down" || args[1].ToLower() == "{down}"))) {
                    SendKeyCombo(VK_DOWN);
                } else if (cmd == "left" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "left" || args[1].ToLower() == "{left}"))) {
                    SendKeyCombo(VK_LEFT);
                } else if (cmd == "right" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "right" || args[1].ToLower() == "{right}"))) {
                    SendKeyCombo(VK_RIGHT);
                } else if (cmd == "win" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "win" || args[1].ToLower() == "start" || args[1].ToLower() == "^{esc}"))) {
                    SendKeyCombo(VK_LWIN);
                } else if (cmd == "wind" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "wind" || args[1].ToLower() == "desktop" || args[1].ToLower() == "#d"))) {
                    SendKeyCombo(VK_LWIN, VK_D);
                } else if (cmd == "wine" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "wine" || args[1].ToLower() == "explorer" || args[1].ToLower() == "#e"))) {
                    SendKeyCombo(VK_LWIN, VK_E);
                } else if (cmd == "altf4" || (cmd == "key" && args.Length >= 2 && (args[1].ToLower() == "altf4" || args[1].ToLower() == "%{f4}"))) {
                    SendKeyCombo(VK_MENU, VK_F4);
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
