using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("AniMessenger")]
[assembly: AssemblyProduct("AniMessenger")]
[assembly: AssemblyCompany("KatamariKei")]

namespace AniMessengerTray
{
    internal static class RuntimeMode
    {
        internal static bool Development { get; private set; }
        internal static string DevelopmentRoot { get; private set; }

        internal static void Configure(string[] args)
        {
            foreach (string arg in args)
            {
                const string prefix = "--development-root=";
                if (!arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                string candidate = arg.Substring(prefix.Length).Trim().Trim('"');
                if (String.IsNullOrWhiteSpace(candidate)) continue;
                Development = true;
                DevelopmentRoot = Path.GetFullPath(candidate);
                return;
            }
            try
            {
                string marker = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "development-root.txt");
                if (!File.Exists(marker)) return;
                string candidate = File.ReadAllText(marker).Trim();
                if (String.IsNullOrWhiteSpace(candidate)) return;
                Development = true;
                DevelopmentRoot = Path.GetFullPath(candidate);
            }
            catch { }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            RuntimeMode.Configure(args);
            bool openBrowser = !Array.Exists(args, delegate(string arg) { return String.Equals(arg, "--background", StringComparison.OrdinalIgnoreCase); });
            string mutexName = RuntimeMode.Development ? "Local\\AniMessenger.Tray.Development" : "Local\\AniMessenger.Tray";
            bool created;
            using (var mutex = new Mutex(true, mutexName, out created))
            {
                if (!created)
                {
                    TrayContext.RunLauncher(openBrowser);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayContext(openBrowser));
            }
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private const string ReleasesUrl = "https://github.com/KatamariKei/AniMessenger/releases/latest";
        private readonly NotifyIcon trayIcon;
        private readonly ToolStripMenuItem statusItem;
        private readonly ToolStripMenuItem startItem;
        private readonly ToolStripMenuItem stopItem;
        private readonly ToolStripMenuItem phoneAccessItem;
        private readonly System.Windows.Forms.Timer statusTimer;
        private readonly string trayPidFile;

        internal TrayContext(bool openBrowser)
        {
            string runtimeDirectory = Path.Combine(GetPrivateHome(), "runtime");
            Directory.CreateDirectory(runtimeDirectory);
            trayPidFile = Path.Combine(runtimeDirectory, "tray.pid");
            File.WriteAllText(trayPidFile, Process.GetCurrentProcess().Id.ToString());

            statusItem = new ToolStripMenuItem("Service status") { Enabled = false };
            var openItem = new ToolStripMenuItem("Open AniMessenger", null, delegate { RunLauncher(true); });
            openItem.Font = new Font(openItem.Font, FontStyle.Bold);
            startItem = new ToolStripMenuItem("Start service", null, delegate { StartService(); });
            stopItem = new ToolStripMenuItem("Stop service", null, delegate
            {
                if (StopService(false)) ShowStatus("AniMessenger stopped", "Your chats are safe. Use this tray icon to start the service again.");
            });
            var updateItem = new ToolStripMenuItem("Check for updates…", null, delegate { OpenUrl(ReleasesUrl); });
            var quitItem = new ToolStripMenuItem("Quit AniMessenger", null, delegate { QuitAniMessenger(); });
            phoneAccessItem = new ToolStripMenuItem("Phone access", null, delegate { TogglePhoneAccess(); });

            var menu = new ContextMenuStrip();
            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(startItem);
            menu.Items.Add(stopItem);
            if (RuntimeMode.Development) menu.Items.Add(phoneAccessItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(updateItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(quitItem);
            menu.Opening += delegate { RefreshStatus(); };

            Icon icon;
            try { icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { icon = SystemIcons.Application; }
            trayIcon = new NotifyIcon
            {
                Icon = icon,
                Text = "AniMessenger",
                ContextMenuStrip = menu,
                Visible = true
            };
            trayIcon.DoubleClick += delegate { RunLauncher(true); };

            statusTimer = new System.Windows.Forms.Timer { Interval = 3000 };
            statusTimer.Tick += delegate { RefreshStatus(); };
            statusTimer.Start();
            RefreshStatus();
            RunLauncher(openBrowser);
        }

        private static string GetInstallRoot()
        {
            if (RuntimeMode.Development) return RuntimeMode.DevelopmentRoot;
            return Path.GetDirectoryName(Application.ExecutablePath);
        }

        private static string GetPrivateHome()
        {
            if (RuntimeMode.Development) return GetInstallRoot();
            string configured = Environment.GetEnvironmentVariable("ANIMESSENGER_HOME");
            if (!String.IsNullOrWhiteSpace(configured)) return Path.GetFullPath(configured);
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(local, "AniMessenger");
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        internal static void RunLauncher(bool openBrowser)
        {
            if (RuntimeMode.Development && ServerIsRunning())
            {
                if (openBrowser) OpenUrl("http://127.0.0.1:5173");
                return;
            }
            string root = GetInstallRoot();
            string node = RuntimeMode.Development ? "node.exe" : Path.Combine(root, "runtime", "node.exe");
            // The development tray is a long-lived GUI process without a console.
            // Use the detached launcher so the Node/Vite children receive stable
            // log handles and survive helper invocations of the existing tray.
            string launcher = Path.Combine(root, "scripts", RuntimeMode.Development ? "start-detached.mjs" : "launch.mjs");
            if ((!RuntimeMode.Development && !File.Exists(node)) || !File.Exists(launcher))
            {
                MessageBox.Show(RuntimeMode.Development ? "AniMessenger's development files are incomplete. Rebuild the development tray and try again." : "AniMessenger's application files are incomplete. Run the installer again to repair them.", "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = node,
                    Arguments = Quote(launcher) + (RuntimeMode.Development && PhoneAccessEnabled() ? " --lan" : "") + (!RuntimeMode.Development && !openBrowser ? " --no-open" : ""),
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(info);
                if (RuntimeMode.Development && openBrowser)
                {
                    for (int attempt = 0; attempt < 40 && !UiIsReady(); attempt++) Thread.Sleep(100);
                    OpenUrl("http://127.0.0.1:5173");
                }
            }
            catch (Exception error)
            {
                MessageBox.Show("AniMessenger could not start. " + error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static int ReadServerPid()
        {
            string file = Path.Combine(GetPrivateHome(), "runtime", RuntimeMode.Development ? "dev.pid" : "server.pid");
            if (!File.Exists(file)) return 0;
            int pid;
            return Int32.TryParse(File.ReadAllText(file).Trim(), out pid) ? pid : 0;
        }

        private static bool ServerIsRunning()
        {
            int pid = ReadServerPid();
            if (pid <= 0) return false;
            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    if (RuntimeMode.Development) return !process.HasExited && String.Equals(Path.GetFileName(process.MainModule.FileName), "node.exe", StringComparison.OrdinalIgnoreCase);
                    return !process.HasExited && PathsMatch(process.MainModule.FileName, Path.Combine(GetInstallRoot(), "runtime", "node.exe"));
                }
            }
            catch { return false; }
        }

        private static bool PathsMatch(string left, string right)
        {
            try
            {
                return String.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private void RefreshStatus()
        {
            bool running = ServerIsRunning();
            statusItem.Text = running ? "Service: Running" : "Service: Stopped";
            startItem.Enabled = !running;
            stopItem.Enabled = running;
            phoneAccessItem.Checked = PhoneAccessEnabled();
            phoneAccessItem.Text = PhoneAccessEnabled() ? "Phone access: On" : "Phone access: Off";
            trayIcon.Text = running ? "AniMessenger — Running" : "AniMessenger — Stopped";
        }

        private void StartService()
        {
            RunLauncher(false);
            var refresh = new System.Windows.Forms.Timer { Interval = 1200 };
            refresh.Tick += delegate
            {
                refresh.Stop();
                refresh.Dispose();
                RefreshStatus();
                if (ServerIsRunning()) ShowStatus("AniMessenger is running", "Double-click the tray icon whenever you want to open it.");
                else ShowStatus("AniMessenger could not start", "Open AniMessenger again or check the local logs for details.");
            };
            refresh.Start();
        }

        private bool StopService(bool quiet)
        {
            int pid = ReadServerPid();
            string pidFile = Path.Combine(GetPrivateHome(), "runtime", RuntimeMode.Development ? "dev.pid" : "server.pid");
            if (pid <= 0)
            {
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }

            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    if (RuntimeMode.Development)
                    {
                        if (!String.Equals(Path.GetFileName(process.MainModule.FileName), "node.exe", StringComparison.OrdinalIgnoreCase))
                            throw new InvalidOperationException("The saved development-service ID belongs to a different program, so AniMessenger left it untouched.");
                        RequestDevelopmentShutdown();
                        if (!process.WaitForExit(5000)) throw new InvalidOperationException("AniMessenger did not stop in time. Try again after the current request finishes.");
                        TryDelete(pidFile);
                        RefreshStatus();
                        return true;
                    }
                    string expected = Path.Combine(GetInstallRoot(), "runtime", "node.exe");
                    if (!PathsMatch(process.MainModule.FileName, expected))
                        throw new InvalidOperationException("The saved service ID belongs to a different program, so AniMessenger left it untouched.");
                    process.Kill();
                    process.WaitForExit(5000);
                }
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }
            catch (ArgumentException)
            {
                TryDelete(pidFile);
                RefreshStatus();
                return true;
            }
            catch (Exception error)
            {
                if (!quiet) MessageBox.Show(error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }

        private static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception error) { MessageBox.Show("Windows could not open the link. " + error.Message, "AniMessenger", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }

        private static bool UiIsReady()
        {
            try
            {
                var request = System.Net.WebRequest.Create("http://127.0.0.1:5173");
                request.Timeout = 250;
                using (var response = request.GetResponse()) return true;
            }
            catch { return false; }
        }

        private static void RequestDevelopmentShutdown()
        {
            var request = System.Net.WebRequest.Create("http://127.0.0.1:5174/api/runtime/shutdown");
            request.Method = "POST";
            request.ContentLength = 0;
            request.Timeout = 2500;
            using (var response = request.GetResponse()) { }
        }

        private static string PhoneAccessMarker()
        {
            return Path.Combine(GetPrivateHome(), "runtime", "phone-access.enabled");
        }

        private static bool PhoneAccessEnabled()
        {
            return RuntimeMode.Development && File.Exists(PhoneAccessMarker());
        }

        private void TogglePhoneAccess()
        {
            bool enable = !PhoneAccessEnabled();
            string marker = PhoneAccessMarker();
            Directory.CreateDirectory(Path.GetDirectoryName(marker));
            if (enable) File.WriteAllText(marker, "enabled"); else TryDelete(marker);
            bool restart = ServerIsRunning();
            if (restart && !StopService(false)) return;
            if (restart) StartService(); else RefreshStatus();
            ShowStatus(enable ? "Phone access is on" : "Phone access is off", enable ? "AniMessenger is available on this private network through port 5173." : "AniMessenger is available only on this computer.");
        }

        private void ShowStatus(string title, string message)
        {
            trayIcon.BalloonTipTitle = title;
            trayIcon.BalloonTipText = message;
            trayIcon.BalloonTipIcon = ToolTipIcon.Info;
            trayIcon.ShowBalloonTip(3500);
        }

        private void QuitAniMessenger()
        {
            if (!StopService(false)) return;
            ExitThread();
        }

        private static void TryDelete(string file)
        {
            try { if (File.Exists(file)) File.Delete(file); }
            catch { }
        }

        protected override void ExitThreadCore()
        {
            statusTimer.Stop();
            statusTimer.Dispose();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            try
            {
                if (File.Exists(trayPidFile) && File.ReadAllText(trayPidFile).Trim() == Process.GetCurrentProcess().Id.ToString())
                    File.Delete(trayPidFile);
            }
            catch { }
            base.ExitThreadCore();
        }
    }
}
