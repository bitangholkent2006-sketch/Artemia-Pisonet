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

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

        const byte VK_BACK = 0x08;
        const byte VK_TAB = 0x09;
        const byte VK_RETURN = 0x0D;
        const byte VK_SHIFT = 0x10;
        const byte VK_CONTROL = 0x11;
        const byte VK_MENU = 0x12;    // Alt
        const byte VK_ESCAPE = 0x1B;
        const byte VK_SPACE = 0x20;
        const byte VK_PRIOR = 0x21;   // Page Up
        const byte VK_NEXT = 0x22;    // Page Down
        const byte VK_END = 0x23;
        const byte VK_HOME = 0x24;
        const byte VK_LEFT = 0x25;
        const byte VK_UP = 0x26;
        const byte VK_RIGHT = 0x27;
        const byte VK_DOWN = 0x28;
        const byte VK_INSERT = 0x2D;
        const byte VK_DELETE = 0x2E;
        const byte VK_LWIN = 0x5B;

        const byte VK_VOLUME_MUTE = 0xAD;
        const byte VK_VOLUME_DOWN = 0xAE;
        const byte VK_VOLUME_UP = 0xAF;

        const byte VK_F1 = 0x70;
        const byte VK_F2 = 0x71;
        const byte VK_F3 = 0x72;
        const byte VK_F4 = 0x73;
        const byte VK_F5 = 0x74;
        const byte VK_F6 = 0x75;
        const byte VK_F7 = 0x76;
        const byte VK_F8 = 0x77;
        const byte VK_F9 = 0x78;
        const byte VK_F10 = 0x79;
        const byte VK_F11 = 0x7A;
        const byte VK_F12 = 0x7B;

        const byte VK_A = 0x41;
        const byte VK_C = 0x43;
        const byte VK_D = 0x44;
        const byte VK_E = 0x45;
        const byte VK_R = 0x52;
        const byte VK_T = 0x54;
        const byte VK_V = 0x56;
        const byte VK_W = 0x57;
        const byte VK_X = 0x58;
        const byte VK_Z = 0x5A;

        static void SendKeyCombo(params byte[] vks) {
            foreach (var vk in vks) {
                byte scan = (byte)MapVirtualKey(vk, 0);
                keybd_event(vk, scan, 0, UIntPtr.Zero);
                Thread.Sleep(5);
            }
            Thread.Sleep(15);
            for (int i = vks.Length - 1; i >= 0; i--) {
                byte scan = (byte)MapVirtualKey(vks[i], 0);
                keybd_event(vks[i], scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
                Thread.Sleep(5);
            }
        }

        static void SendSingleKey(byte vk) {
            byte scan = (byte)MapVirtualKey(vk, 0);
            keybd_event(vk, scan, 0, UIntPtr.Zero);
            Thread.Sleep(8);
            keybd_event(vk, scan, KEYEVENTF_KEYUP, UIntPtr.Zero);
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

        static void CaptureScreen(int targetWidth = 960, long quality = 50L) {
            try {
                Rectangle bounds = Screen.PrimaryScreen.Bounds;
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
                            encParams.Param[0] = new EncoderParameter(Encoder.Quality, quality);
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

        public static void ExecuteCommand(string[] args) {
            if (args == null || args.Length == 0) return;
            string cmd = args[0].ToLower();

            if (cmd == "capture" || cmd == "screenshot") {
                int width = 960;
                long qual = 50L;
                if (args.Length >= 2) int.TryParse(args[1], out width);
                if (args.Length >= 3) long.TryParse(args[2], out qual);
                CaptureScreen(width, qual);
                return;
            }

            // Mouse Actions: move, click, dclick, rclick, down, up, rdown, rup
            if (cmd == "click" || cmd == "dclick" || cmd == "rclick" || cmd == "move" ||
                cmd == "down" || cmd == "up" || cmd == "rdown" || cmd == "rup") {
                if (args.Length >= 3) {
                    int x = int.Parse(args[1]);
                    int y = int.Parse(args[2]);
                    SetCursorPos(x, y);

                    if (cmd == "click") {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(12);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    } else if (cmd == "dclick") {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        Thread.Sleep(30);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    } else if (cmd == "rclick") {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(12);
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    } else if (cmd == "down") {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    } else if (cmd == "up") {
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    } else if (cmd == "rdown") {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                    } else if (cmd == "rup") {
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    }
                }
                return;
            }

            if (cmd == "scroll" && args.Length >= 2) {
                int delta = int.Parse(args[1]);
                mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, 0);
                return;
            }

            // Shortcut Combos
            if (cmd == "alttab") {
                SendKeyCombo(VK_MENU, VK_TAB);
                return;
            }
            if (cmd == "altf4") {
                SendKeyCombo(VK_MENU, VK_F4);
                return;
            }
            if (cmd == "taskmgr") {
                SendKeyCombo(VK_CONTROL, VK_SHIFT, VK_ESCAPE);
                return;
            }
            if (cmd == "wind") {
                SendKeyCombo(VK_LWIN, VK_D);
                return;
            }
            if (cmd == "wine") {
                SendKeyCombo(VK_LWIN, VK_E);
                return;
            }
            if (cmd == "winr") {
                SendKeyCombo(VK_LWIN, VK_R);
                return;
            }
            if (cmd == "ctrlc") {
                SendKeyCombo(VK_CONTROL, VK_C);
                return;
            }
            if (cmd == "ctrlv") {
                SendKeyCombo(VK_CONTROL, VK_V);
                return;
            }
            if (cmd == "ctrla") {
                SendKeyCombo(VK_CONTROL, VK_A);
                return;
            }
            if (cmd == "ctrlz") {
                SendKeyCombo(VK_CONTROL, VK_Z);
                return;
            }
            if (cmd == "ctrlx") {
                SendKeyCombo(VK_CONTROL, VK_X);
                return;
            }
            if (cmd == "ctrlw") {
                SendKeyCombo(VK_CONTROL, VK_W);
                return;
            }
            if (cmd == "ctrlt") {
                SendKeyCombo(VK_CONTROL, VK_T);
                return;
            }

            // Volume controls
            if (cmd == "volup") {
                SendSingleKey(VK_VOLUME_UP);
                return;
            }
            if (cmd == "voldown") {
                SendSingleKey(VK_VOLUME_DOWN);
                return;
            }
            if (cmd == "volmute") {
                SendSingleKey(VK_VOLUME_MUTE);
                return;
            }

            // Single Keys
            if (cmd == "tab") { SendSingleKey(VK_TAB); return; }
            if (cmd == "enter") { SendSingleKey(VK_RETURN); return; }
            if (cmd == "backspace") { SendSingleKey(VK_BACK); return; }
            if (cmd == "esc") { SendSingleKey(VK_ESCAPE); return; }
            if (cmd == "space") { SendSingleKey(VK_SPACE); return; }
            if (cmd == "delete") { SendSingleKey(VK_DELETE); return; }
            if (cmd == "insert") { SendSingleKey(VK_INSERT); return; }
            if (cmd == "home") { SendSingleKey(VK_HOME); return; }
            if (cmd == "end") { SendSingleKey(VK_END); return; }
            if (cmd == "pageup") { SendSingleKey(VK_PRIOR); return; }
            if (cmd == "pagedown") { SendSingleKey(VK_NEXT); return; }
            if (cmd == "up") { SendSingleKey(VK_UP); return; }
            if (cmd == "down") { SendSingleKey(VK_DOWN); return; }
            if (cmd == "left") { SendSingleKey(VK_LEFT); return; }
            if (cmd == "right") { SendSingleKey(VK_RIGHT); return; }
            if (cmd == "win") { SendSingleKey(VK_LWIN); return; }

            // F-Keys
            if (cmd == "f1") { SendSingleKey(VK_F1); return; }
            if (cmd == "f2") { SendSingleKey(VK_F2); return; }
            if (cmd == "f3") { SendSingleKey(VK_F3); return; }
            if (cmd == "f4") { SendSingleKey(VK_F4); return; }
            if (cmd == "f5") { SendSingleKey(VK_F5); return; }
            if (cmd == "f6") { SendSingleKey(VK_F6); return; }
            if (cmd == "f7") { SendSingleKey(VK_F7); return; }
            if (cmd == "f8") { SendSingleKey(VK_F8); return; }
            if (cmd == "f9") { SendSingleKey(VK_F9); return; }
            if (cmd == "f10") { SendSingleKey(VK_F10); return; }
            if (cmd == "f11") { SendSingleKey(VK_F11); return; }
            if (cmd == "f12") { SendSingleKey(VK_F12); return; }

            // Key parameter parser
            if (cmd == "key" && args.Length >= 2) {
                string k = args[1].ToLower();
                if (k == "alttab" || k == "%{tab}") { SendKeyCombo(VK_MENU, VK_TAB); return; }
                if (k == "altf4" || k == "%{f4}") { SendKeyCombo(VK_MENU, VK_F4); return; }
                if (k == "taskmgr" || k == "^+{esc}") { SendKeyCombo(VK_CONTROL, VK_SHIFT, VK_ESCAPE); return; }
                if (k == "wind" || k == "#d") { SendKeyCombo(VK_LWIN, VK_D); return; }
                if (k == "wine" || k == "#e") { SendKeyCombo(VK_LWIN, VK_E); return; }
                if (k == "winr" || k == "#r") { SendKeyCombo(VK_LWIN, VK_R); return; }
                if (k == "ctrlc" || k == "^c") { SendKeyCombo(VK_CONTROL, VK_C); return; }
                if (k == "ctrlv" || k == "^v") { SendKeyCombo(VK_CONTROL, VK_V); return; }
                if (k == "ctrla" || k == "^a") { SendKeyCombo(VK_CONTROL, VK_A); return; }
                if (k == "ctrlz" || k == "^z") { SendKeyCombo(VK_CONTROL, VK_Z); return; }
                if (k == "tab" || k == "{tab}") { SendSingleKey(VK_TAB); return; }
                if (k == "enter" || k == "{enter}") { SendSingleKey(VK_RETURN); return; }
                if (k == "backspace" || k == "{backspace}" || k == "{bs}") { SendSingleKey(VK_BACK); return; }
                if (k == "esc" || k == "{esc}") { SendSingleKey(VK_ESCAPE); return; }
                if (k == "space") { SendSingleKey(VK_SPACE); return; }
                if (k == "delete" || k == "{delete}") { SendSingleKey(VK_DELETE); return; }
                if (k == "insert" || k == "{insert}") { SendSingleKey(VK_INSERT); return; }
                if (k == "home" || k == "{home}") { SendSingleKey(VK_HOME); return; }
                if (k == "end" || k == "{end}") { SendSingleKey(VK_END); return; }
                if (k == "pageup" || k == "{pgup}") { SendSingleKey(VK_PRIOR); return; }
                if (k == "pagedown" || k == "{pgdn}") { SendSingleKey(VK_NEXT); return; }
                if (k == "up" || k == "{up}") { SendSingleKey(VK_UP); return; }
                if (k == "down" || k == "{down}") { SendSingleKey(VK_DOWN); return; }
                if (k == "left" || k == "{left}") { SendSingleKey(VK_LEFT); return; }
                if (k == "right" || k == "{right}") { SendSingleKey(VK_RIGHT); return; }
                if (k == "win" || k == "start") { SendSingleKey(VK_LWIN); return; }
                if (k == "f5" || k == "{f5}") { SendSingleKey(VK_F5); return; }
                if (k == "volup") { SendSingleKey(VK_VOLUME_UP); return; }
                if (k == "voldown") { SendSingleKey(VK_VOLUME_DOWN); return; }
                if (k == "volmute") { SendSingleKey(VK_VOLUME_MUTE); return; }

                // Fallback to SendKeys for any generic specifier
                SendKeys.SendWait(args[1]);
                return;
            }

            if (cmd == "text" && args.Length >= 2) {
                string text = string.Join(" ", args, 1, args.Length - 1);
                SendKeys.SendWait(text);
                return;
            }
        }

        [STAThread]
        static void Main(string[] args) {
            if (args.Length == 0) return;

            // Persistent Worker / Daemon Mode for Microsecond Latency
            if (args[0].ToLower() == "worker" || args[0].ToLower() == "daemon") {
                string line;
                while ((line = Console.ReadLine()) != null) {
                    line = line.Trim();
                    if (line.Length == 0) continue;
                    if (line.ToLower() == "exit" || line.ToLower() == "quit") break;
                    try {
                        string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        ExecuteCommand(parts);
                        Console.WriteLine("OK");
                    } catch (Exception ex) {
                        Console.WriteLine("ERR " + ex.Message);
                    }
                    Console.Out.Flush();
                }
                return;
            }

            try {
                ExecuteCommand(args);
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
            }
        }
    }
}
