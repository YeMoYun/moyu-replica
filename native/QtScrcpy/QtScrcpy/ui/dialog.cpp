#include <QDebug>
#include <QAbstractItemView>
// Modified for MoYuMaster: native wireless pairing without USB or console UI.
#include <QCheckBox>
#include <QFile>
#include <QFileDialog>
#include <QFormLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QGuiApplication>
#include <QHostAddress>
#include <QKeyEvent>
#include <QComboBox>
#include <QLineEdit>
#include <QPushButton>
#include <QResizeEvent>
#include <QRandomGenerator>
#include <QRegularExpression>
#include <QSizePolicy>
#include <QScreen>
#include <QSettings>
#include <QStyledItemDelegate>
#include <QTime>
#include <QTimer>
#include <QVBoxLayout>

#include "config.h"
#include "dialog.h"
#include "moyucontrolbar.h"
#include "moyuwindowcontroller.h"
#include "ui_dialog.h"
#include "videoform.h"
#include "wirelessadbcontroller.h"
#include "wirelesspairdialog.h"
#include "../groupcontroller/groupcontroller.h"

#ifdef Q_OS_WIN32
#include "../util/winutils.h"
#endif

QString s_keyMapPath = "";

namespace {
bool isWirelessSerial(const QString &serial)
{
    const QString value = serial.trimmed();
    const int separator = value.lastIndexOf(QLatin1Char(':'));
    if (separator <= 0 || separator == value.size() - 1) {
        return false;
    }
    QString host = value.left(separator);
    if (host.startsWith(QLatin1Char('[')) && host.endsWith(QLatin1Char(']'))) {
        host = host.mid(1, host.size() - 2);
    }
    bool portOk = false;
    const int port = value.mid(separator + 1).toInt(&portOk);
    QHostAddress address;
    return portOk && port >= 1 && port <= 65535 && address.setAddress(host);
}

QString wirelessAdbPath()
{
    const QStringList candidates = {
        QString::fromLocal8Bit(qgetenv("QTSCRCPY_ADB_PATH")),
        Config::getInstance().getAdbPath(),
#ifdef Q_OS_WIN32
        QCoreApplication::applicationDirPath() + QStringLiteral("/adb.exe")
#else
        QCoreApplication::applicationDirPath() + QStringLiteral("/adb")
#endif
    };
    for (const QString &candidate : candidates) {
        const QFileInfo file(candidate);
        if (!candidate.trimmed().isEmpty() && file.isFile()) {
            return file.absoluteFilePath();
        }
    }
    return candidates.constLast();
}

class ComboBoxItemDelegate final : public QStyledItemDelegate
{
public:
    explicit ComboBoxItemDelegate(QObject *parent = nullptr) : QStyledItemDelegate(parent) {}

    QSize sizeHint(const QStyleOptionViewItem &option, const QModelIndex &index) const override
    {
        QSize hint = QStyledItemDelegate::sizeHint(option, index);
        hint.setHeight(qMax(hint.height(), 30));
        return hint;
    }
};
} // namespace

const QString &getKeyMapPath()
{
    if (s_keyMapPath.isEmpty()) {
        s_keyMapPath = QString::fromLocal8Bit(qgetenv("QTSCRCPY_KEYMAP_PATH"));
        QFileInfo fileInfo(s_keyMapPath);
        if (s_keyMapPath.isEmpty() || !fileInfo.isDir()) {
            s_keyMapPath = QCoreApplication::applicationDirPath() + "/keymap";
        }
    }
    return s_keyMapPath;
}

Dialog::Dialog(QWidget *parent) : QWidget(parent), ui(new Ui::Widget)
{
    ui->setupUi(this);
    initUI();

    updateBootConfig(true);

    // Intel Mac 上如果配置文件遗留 decodeMode=1，强制重置为 0
    // （VideoToolbox 选项在 initUI() 中已被移除）
#if defined(Q_OS_MACOS) && !defined(__arm64__)
    if (ui->decodeModeBox->currentIndex() != 0) {
        ui->decodeModeBox->setCurrentIndex(0);
    }
#endif

    on_useSingleModeCheck_clicked();
    m_moyuWindow->restoreAndPresent();
    on_updateDevice_clicked();

    connect(&m_autoUpdatetimer, &QTimer::timeout, this, &Dialog::on_updateDevice_clicked);
    if (ui->autoUpdatecheckBox->isChecked()) {
        m_autoUpdatetimer.start(5000);
    }

    connect(&m_adb, &qsc::AdbProcess::adbProcessResult, this, [this](qsc::AdbProcess::ADB_EXEC_RESULT processResult) {
        QString log = "";
        bool newLine = true;
        QStringList args = m_adb.arguments();

        switch (processResult) {
        case qsc::AdbProcess::AER_ERROR_START:
            break;
        case qsc::AdbProcess::AER_SUCCESS_START:
            log = "adb run";
            newLine = false;
            break;
        case qsc::AdbProcess::AER_ERROR_EXEC:
            //log = m_adb.getErrorOut();
            break;
        case qsc::AdbProcess::AER_ERROR_MISSING_BINARY:
            log = "adb not found";
            break;
        case qsc::AdbProcess::AER_SUCCESS_EXEC:
            //log = m_adb.getStdOut();
            if (args.contains("devices")) {
                QStringList devices = m_adb.getDevicesSerialFromStdOut();
                ui->serialBox->clear();
                ui->connectedPhoneList->clear();
                for (auto &item : devices) {
                    if (!isWirelessSerial(item)) {
                        continue;
                    }
                    ui->serialBox->addItem(item);
                    ui->connectedPhoneList->addItem(Config::getInstance().getNickName(item) + "-" + item);
                }
                if (m_selectSingleWirelessAfterRefresh) {
                    if (ui->serialBox->count() == 1) {
                        ui->serialBox->setCurrentIndex(0);
                        ui->connectedPhoneList->setCurrentRow(0);
                    }
                    m_selectSingleWirelessAfterRefresh = false;
                }
            }
            break;
        }
        if (!log.isEmpty()) {
            outLog(log, newLine);
        }
    });

    m_hideIcon = new QSystemTrayIcon(this);
    m_hideIcon->setIcon(QIcon(":/image/tray/logo.png"));
    m_menu = new QMenu(this);
    m_quit = new QAction(this);
    m_showWindow = new QAction(this);
    m_showWindow->setText(tr("show"));
    m_quit->setText(tr("quit"));
    m_menu->addAction(m_showWindow);
    m_menu->addAction(m_quit);
    m_hideIcon->setContextMenu(m_menu);
    m_hideIcon->show();
    connect(m_showWindow, &QAction::triggered, this, &Dialog::show);
    connect(m_quit, &QAction::triggered, this, [this]() {
        m_hideIcon->hide();
        qApp->quit();
    });
    connect(m_hideIcon, &QSystemTrayIcon::activated, this, &Dialog::slotActivated);

    connect(&qsc::IDeviceManage::getInstance(), &qsc::IDeviceManage::deviceConnected, this, &Dialog::onDeviceConnected);
    connect(&qsc::IDeviceManage::getInstance(), &qsc::IDeviceManage::deviceDisconnected, this, &Dialog::onDeviceDisconnected);
}

Dialog::~Dialog()
{
    qDebug() << "~Dialog()";
    updateBootConfig(false);
    qsc::IDeviceManage::getInstance().disconnectAllDevice();
    delete ui;
}

void Dialog::initUI()
{
    setAttribute(Qt::WA_DeleteOnClose);
    //setWindowFlags(windowFlags() | Qt::WindowMinimizeButtonHint | Qt::WindowCloseButtonHint | Qt::CustomizeWindowHint);

    setWindowTitle(Config::getInstance().getTitle());
#ifdef Q_OS_LINUX
    // Set window icon (inherits from application icon set in main.cpp)
    // If application icon was set, this will use it automatically
    if (!qApp->windowIcon().isNull()) {
        setWindowIcon(qApp->windowIcon());
    }
#endif

#ifdef Q_OS_WIN32
    WinUtils::setDarkBorderToWindow((HWND)this->winId(), true);
#endif

    ui->wifiConnectBtn->hide();
    ui->usbConnectBtn->hide();
    ui->startAdbdBtn->hide();
    ui->getIPBtn->hide();
    ui->deviceIpEdt->hide();
    ui->devicePortEdt->hide();
    ui->label->hide();
    ui->wirelessConnectBtn->setText(QStringLiteral("无线连接"));
    ui->wirelessDisConnectBtn->setText(QStringLiteral("断开无线设备"));

    const QMargins rootMargins = ui->horizontalLayout_11->contentsMargins();
    ui->horizontalLayout_11->setContentsMargins(rootMargins.left(), 34,
                                                rootMargins.right(), rootMargins.bottom());
    m_moyuBar = new MoyuControlBar(MoyuControlBar::Role::MainWindow, this);
    m_moyuBar->setGeometry(0, 0, width(), 34);
    m_moyuBar->raise();
    m_moyuWindow = new MoyuWindowController(this, m_moyuBar,
                                            QStringLiteral("main"), this);
    m_moyuWindow->setFitAction([this]() { m_moyuWindow->restoreAndPresent(); });
    connect(m_moyuBar, &MoyuControlBar::controlRequested, this, [this]() {
        if (!m_lastVideoForm) {
            QMessageBox::information(this, QStringLiteral("手机投屏模式"),
                                     QStringLiteral("请先连接并启动设备"));
            return;
        }
        if (m_lastVideoForm->isMinimized()) {
            m_lastVideoForm->showNormal();
        }
        m_lastVideoForm->show();
        m_lastVideoForm->raise();
        m_lastVideoForm->activateWindow();
    });
    connect(m_moyuBar, &MoyuControlBar::homeRequested,
            this, &Dialog::focusMainAppRequested);
    connect(m_moyuBar, &MoyuControlBar::helpRequested, this, [this]() {
        QMessageBox::information(
            this,
            QStringLiteral("手机投屏操作帮助"),
            QStringLiteral("请先在 Android 11 及以上手机中开启“无线调试”，点击“无线连接”，"
                           "使用配对地址和 6 位配对码完成第一步，再填写无线调试主页的连接端口。\n\n"
                           "顶部控制条可关闭、置顶、适应窗口、调透明度、移出隐藏、定位投屏窗口、"
                           "全屏、切换外观或收起。"));
    });

    ui->bitRateEdit->setValidator(new QIntValidator(1, 99999, this));

    ui->maxSizeBox->addItem("640");
    ui->maxSizeBox->addItem("720");
    ui->maxSizeBox->addItem("1080");
    ui->maxSizeBox->addItem("1280");
    ui->maxSizeBox->addItem("1920");
    ui->maxSizeBox->addItem(tr("original"));

    ui->videoSourceBox->addItem(tr("display"));
    ui->videoSourceBox->addItem(tr("camera"));
    ui->cameraFacingBox->addItem(tr("back"));
    ui->cameraFacingBox->addItem(tr("front"));

    ui->formatBox->addItem("mp4");
    ui->formatBox->addItem("mkv");

    ui->lockOrientationBox->addItem(tr("no lock"));
    ui->lockOrientationBox->addItem("0");
    ui->lockOrientationBox->addItem("90");
    ui->lockOrientationBox->addItem("180");
    ui->lockOrientationBox->addItem("270");
    ui->lockOrientationBox->setCurrentIndex(0);

    ui->decodeModeBox->addItem(tr("FFmpeg + OpenGL (Universal Default)"));
    ui->decodeModeBox->addItem(tr("VideoToolbox + Metal (Apple Silicon Only)"));
    ui->decodeModeBox->setCurrentIndex(0);

#ifndef Q_OS_MACOS
    // 非 macOS：隐藏整个解码模式控件行
    ui->decodeModeLabel->hide();
    ui->decodeModeBox->hide();
#elif !defined(__arm64__)
    // Intel Mac：移除 VideoToolbox 选项，用户只看到 FFmpeg
    ui->decodeModeBox->removeItem(1);
#endif

    initAdvancedDisplayUi();

    for (QComboBox *comboBox : findChildren<QComboBox *>()) {
        comboBox->view()->setItemDelegate(new ComboBoxItemDelegate(comboBox->view()));
    }

    QSizePolicy simpleModePolicy = ui->simpleGroupBox->sizePolicy();
    simpleModePolicy.setVerticalPolicy(QSizePolicy::Maximum);
    ui->simpleGroupBox->setSizePolicy(simpleModePolicy);

    QSizePolicy logPolicy = ui->outEdit->sizePolicy();
    logPolicy.setVerticalPolicy(QSizePolicy::Expanding);
    ui->outEdit->setSizePolicy(logPolicy);
    ui->verticalLayout_5->setStretch(0, 0);
    ui->verticalLayout_5->setStretch(1, 0);
    ui->verticalLayout_5->setStretch(2, 0);
    ui->verticalLayout_5->setStretch(3, 1);
}

void Dialog::initAdvancedDisplayUi()
{
    m_advancedDisplayGroup = new QGroupBox(tr("Advanced display"), this);
    m_advancedDisplayGroup->setCheckable(true);
    m_advancedDisplayGroup->setChecked(false);
    auto *layout = new QFormLayout(m_advancedDisplayGroup);

    m_displayModeBox = new QComboBox(m_advancedDisplayGroup);
    m_displayModeBox->addItem(tr("Primary display"));
    m_displayModeBox->addItem(tr("Existing display ID"));
    m_displayModeBox->addItem(tr("New virtual display"));
    layout->addRow(tr("Display mode"), m_displayModeBox);

    m_displayIdEdit = new QLineEdit(m_advancedDisplayGroup);
    m_displayIdEdit->setPlaceholderText("1");
    layout->addRow(tr("Display ID"), m_displayIdEdit);

    m_newDisplayEdit = new QLineEdit(m_advancedDisplayGroup);
    m_newDisplayEdit->setPlaceholderText("1920x1080/240");
    layout->addRow(tr("Virtual size / DPI"), m_newDisplayEdit);

    m_cropEdit = new QLineEdit(m_advancedDisplayGroup);
    m_cropEdit->setPlaceholderText("width:height:x:y");
    layout->addRow(tr("Crop"), m_cropEdit);

    m_flexDisplayCheck = new QCheckBox(tr("Resize virtual display with window"), m_advancedDisplayGroup);
    layout->addRow(m_flexDisplayCheck);
    m_displayImePolicyBox = new QComboBox(m_advancedDisplayGroup);
    m_displayImePolicyBox->addItem(tr("Server default"), "");
    m_displayImePolicyBox->addItem("local", "local");
    m_displayImePolicyBox->addItem("fallback", "fallback");
    m_displayImePolicyBox->addItem("hide", "hide");
    layout->addRow(tr("IME policy"), m_displayImePolicyBox);
    m_vdSystemDecorationsCheck = new QCheckBox(tr("Show system decorations"), m_advancedDisplayGroup);
    m_vdSystemDecorationsCheck->setChecked(true);
    layout->addRow(m_vdSystemDecorationsCheck);
    m_vdDestroyContentCheck = new QCheckBox(tr("Destroy content on close"), m_advancedDisplayGroup);
    m_vdDestroyContentCheck->setChecked(true);
    layout->addRow(m_vdDestroyContentCheck);
    m_keepActiveCheck = new QCheckBox(tr("Keep device active"), m_advancedDisplayGroup);
    layout->addRow(m_keepActiveCheck);
    auto *startAppWidget = new QWidget(m_advancedDisplayGroup);
    auto *startAppLayout = new QHBoxLayout(startAppWidget);
    startAppLayout->setContentsMargins(0, 0, 0, 0);
    m_startAppBox = new QComboBox(startAppWidget);
    m_startAppBox->setEditable(true);
    m_startAppBox->setInsertPolicy(QComboBox::NoInsert);
    m_startAppBox->setPlaceholderText("com.android.settings");
    m_startAppBox->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
    m_refreshAppsBtn = new QPushButton(tr("refresh"), startAppWidget);
    m_refreshAppsBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Fixed);
    m_refreshAppsBtn->setFixedWidth(m_refreshAppsBtn->sizeHint().width());
    startAppLayout->addWidget(m_startAppBox);
    startAppLayout->addWidget(m_refreshAppsBtn);
    layout->addRow(tr("Start app"), startAppWidget);

    // Keep infrequently used display parameters out of the primary start
    // configuration, immediately above the expanding spacer on the right.
    ui->verticalLayout_6->insertWidget(ui->verticalLayout_6->count() - 1, m_advancedDisplayGroup);
    connect(m_displayModeBox, QOverload<int>::of(&QComboBox::currentIndexChanged), this, &Dialog::updateAdvancedDisplayUi);
    connect(m_flexDisplayCheck, &QCheckBox::toggled, this, &Dialog::updateAdvancedDisplayUi);
    connect(m_refreshAppsBtn, &QPushButton::clicked, this, &Dialog::on_refreshAppsBtn_clicked);
    updateAdvancedDisplayUi();
}

void Dialog::updateAdvancedDisplayUi()
{
    if (!m_displayModeBox) {
        return;
    }
    const bool existing = m_displayModeBox->currentIndex() == 1;
    const bool virtualDisplay = m_displayModeBox->currentIndex() == 2;
    m_displayIdEdit->setEnabled(existing);
    m_newDisplayEdit->setEnabled(virtualDisplay);
    m_flexDisplayCheck->setEnabled(virtualDisplay);
    if (!virtualDisplay) {
        m_flexDisplayCheck->setChecked(false);
    }
    m_displayImePolicyBox->setEnabled(virtualDisplay);
    m_vdSystemDecorationsCheck->setEnabled(virtualDisplay);
    m_vdDestroyContentCheck->setEnabled(virtualDisplay);
    m_cropEdit->setEnabled(!m_flexDisplayCheck->isChecked());
}

void Dialog::updateBootConfig(bool toView)
{
    if (toView) {
        UserBootConfig config = Config::getInstance().getUserBootConfig();

        if (config.bitRate == 0) {
            ui->bitRateBox->setCurrentText("Mbps");
        } else if (config.bitRate % 1000000 == 0) {
            ui->bitRateEdit->setText(QString::number(config.bitRate / 1000000));
            ui->bitRateBox->setCurrentText("Mbps");
        } else {
            ui->bitRateEdit->setText(QString::number(config.bitRate / 1000));
            ui->bitRateBox->setCurrentText("Kbps");
        }

        ui->maxSizeBox->setCurrentIndex(config.maxSizeIndex);
        ui->formatBox->setCurrentIndex(config.recordFormatIndex);
        ui->recordPathEdt->setText(config.recordPath);
        ui->lockOrientationBox->setCurrentIndex(config.lockOrientationIndex);
        ui->framelessCheck->setChecked(config.framelessWindow);
        ui->recordScreenCheck->setChecked(config.recordScreen);
        ui->notDisplayCheck->setChecked(config.recordBackground);
        ui->useReverseCheck->setChecked(config.reverseConnect);
        ui->fpsCheck->setChecked(config.showFPS);
        ui->alwaysTopCheck->setChecked(config.windowOnTop);
        ui->closeScreenCheck->setChecked(config.autoOffScreen);
        ui->stayAwakeCheck->setChecked(config.keepAlive);
        ui->useSingleModeCheck->setChecked(config.simpleMode);
        ui->autoUpdatecheckBox->setChecked(config.autoUpdateDevice);
        ui->showToolbar->setChecked(config.showToolbar);
        ui->decodeModeBox->setCurrentIndex(config.decodeMode);
        ui->videoSourceBox->setCurrentIndex(config.videoSource);
        ui->cameraFacingBox->setCurrentIndex(qBound(0, config.cameraFacing, 1));
        if (m_advancedDisplayGroup) {
            m_advancedDisplayGroup->setChecked(config.advancedDisplay);
            m_displayModeBox->setCurrentIndex(qBound(0, config.displayMode, 2));
            m_displayIdEdit->setText(config.displayId);
            m_newDisplayEdit->setText(config.newDisplay);
            m_cropEdit->setText(config.crop);
            m_flexDisplayCheck->setChecked(config.flexDisplay);
            m_displayImePolicyBox->setCurrentIndex(qMax(0, m_displayImePolicyBox->findData(config.displayImePolicy)));
            m_vdSystemDecorationsCheck->setChecked(config.vdSystemDecorations);
            m_vdDestroyContentCheck->setChecked(config.vdDestroyContent);
            m_keepActiveCheck->setChecked(config.keepActive);
            m_startAppBox->setEditText(config.startApp);
            updateAdvancedDisplayUi();
        }
        updateVideoSourceUi();
    } else {
        UserBootConfig config;

        config.bitRate = getBitRate();
        config.maxSizeIndex = ui->maxSizeBox->currentIndex();
        config.recordFormatIndex = ui->formatBox->currentIndex();
        config.recordPath = ui->recordPathEdt->text();
        config.lockOrientationIndex = ui->lockOrientationBox->currentIndex();
        config.recordScreen = ui->recordScreenCheck->isChecked();
        config.recordBackground = ui->notDisplayCheck->isChecked();
        config.reverseConnect = ui->useReverseCheck->isChecked();
        config.showFPS = ui->fpsCheck->isChecked();
        config.windowOnTop = ui->alwaysTopCheck->isChecked();
        config.autoOffScreen = ui->closeScreenCheck->isChecked();
        config.framelessWindow = ui->framelessCheck->isChecked();
        config.keepAlive = ui->stayAwakeCheck->isChecked();
        config.simpleMode = ui->useSingleModeCheck->isChecked();
        config.autoUpdateDevice = ui->autoUpdatecheckBox->isChecked();
        config.showToolbar = ui->showToolbar->isChecked();
        config.decodeMode = ui->decodeModeBox->currentIndex();
        config.videoSource = ui->videoSourceBox->currentIndex();
        config.cameraFacing = qMin(ui->cameraFacingBox->currentIndex(), 1);
        if (m_advancedDisplayGroup) {
            config.advancedDisplay = m_advancedDisplayGroup->isChecked();
            config.displayMode = m_displayModeBox->currentIndex();
            config.displayId = m_displayIdEdit->text().trimmed();
            config.newDisplay = m_newDisplayEdit->text().trimmed();
            config.crop = m_cropEdit->text().trimmed();
            config.flexDisplay = m_flexDisplayCheck->isChecked();
            config.displayImePolicy = m_displayImePolicyBox->currentData().toString();
            config.vdSystemDecorations = m_vdSystemDecorationsCheck->isChecked();
            config.vdDestroyContent = m_vdDestroyContentCheck->isChecked();
            config.keepActive = m_keepActiveCheck->isChecked();
            config.startApp = m_startAppBox->currentData().toString();
            if (config.startApp.isEmpty()) {
                config.startApp = m_startAppBox->currentText().trimmed();
            }
        }

        Config::getInstance().setUserBootConfig(config);
    }
}

void Dialog::execAdbCmd()
{
    if (checkAdbRun()) {
        return;
    }
    QString cmd = ui->adbCommandEdt->text().trimmed();
    outLog("adb " + cmd, false);
#if QT_VERSION >= QT_VERSION_CHECK(5, 15, 0)
    m_adb.execute(ui->serialBox->currentText().trimmed(), cmd.split(" ", Qt::SkipEmptyParts));
#else
    m_adb.execute(ui->serialBox->currentText().trimmed(), cmd.split(" ", QString::SkipEmptyParts));
#endif
}

QString Dialog::getGameScript(const QString &fileName)
{
    if (fileName.isEmpty()) {
        return "";
    }

    QFile loadFile(getKeyMapPath() + "/" + fileName);
    if (!loadFile.open(QIODevice::ReadOnly)) {
        outLog("open file failed:" + fileName, true);
        return "";
    }

    QString ret = loadFile.readAll();
    loadFile.close();
    return ret;
}

void Dialog::slotActivated(QSystemTrayIcon::ActivationReason reason)
{
    switch (reason) {
    case QSystemTrayIcon::Trigger:
#ifdef Q_OS_WIN32
        this->show();
#endif
        break;
    default:
        break;
    }
}

void Dialog::closeEvent(QCloseEvent *event)
{
    this->hide();
    if (!Config::getInstance().getTrayMessageShown()) {
        Config::getInstance().setTrayMessageShown(true);
        m_hideIcon->showMessage(tr("Notice"),
                                tr("Hidden here!"),
                                QSystemTrayIcon::Information,
                                3000);
    }
    event->ignore();
}

void Dialog::restoreAndPresent()
{
    if (m_moyuWindow) {
        m_moyuWindow->restoreAndPresent();
        return;
    }
    showNormal();
    show();
    raise();
    activateWindow();
}

void Dialog::resizeEvent(QResizeEvent *event)
{
    QWidget::resizeEvent(event);
    if (m_moyuBar) {
        m_moyuBar->setGeometry(0, 0, width(), 34);
        m_moyuBar->raise();
    }
}

void Dialog::on_updateDevice_clicked()
{
    if (checkAdbRun()) {
        return;
    }
    outLog("update devices...", false);
    m_adb.execute("", QStringList() << "devices");
}

void Dialog::updateVideoSourceUi()
{
    const bool camera = ui->videoSourceBox->currentIndex() == qsc::VIDEO_SOURCE_CAMERA;
    ui->cameraFacingLabel->setEnabled(camera);
    ui->cameraFacingBox->setEnabled(camera);
    ui->refreshCameraBtn->setEnabled(camera);
    ui->closeScreenCheck->setEnabled(!camera);
    ui->stayAwakeCheck->setEnabled(!camera);
    ui->gameBox->setEnabled(!camera);
    ui->refreshGameScriptBtn->setEnabled(!camera);
    ui->applyScriptBtn->setEnabled(!camera);
    ui->installSndcpyBtn->setEnabled(!camera);
    ui->startAudioBtn->setEnabled(!camera);
    if (m_advancedDisplayGroup) {
        m_advancedDisplayGroup->setEnabled(!camera);
    }
}

void Dialog::on_videoSourceBox_currentIndexChanged(int)
{
    updateVideoSourceUi();
}

void Dialog::on_startServerBtn_clicked()
{
    outLog("start server...", false);

    // this is ok that "original" toUshort is 0
    quint16 videoSize = ui->maxSizeBox->currentText().trimmed().toUShort();
    qsc::DeviceParams params;
    params.serial = ui->serialBox->currentText().trimmed();
    params.maxSize = videoSize;
    params.bitRate = getBitRate();
    // on devices with Android >= 10, the capture frame rate can be limited
    params.maxFps = static_cast<quint32>(Config::getInstance().getMaxFps());
    params.videoSource = static_cast<qsc::VideoSource>(ui->videoSourceBox->currentIndex());
    params.cameraFacing = ui->cameraFacingBox->currentIndex() == 1
            ? qsc::CAMERA_FACING_FRONT
            : qsc::CAMERA_FACING_BACK;
    params.cameraId = ui->cameraFacingBox->currentData().toString();
    const bool camera = params.videoSource == qsc::VIDEO_SOURCE_CAMERA;
    params.closeScreen = !camera && ui->closeScreenCheck->isChecked();
    params.useReverse = ui->useReverseCheck->isChecked();
    params.display = !ui->notDisplayCheck->isChecked();
    params.renderExpiredFrames = Config::getInstance().getRenderExpiredFrames();
    if (ui->lockOrientationBox->currentIndex() > 0) {
        params.captureOrientationLock = 1;
        params.captureOrientation = (ui->lockOrientationBox->currentIndex() - 1) * 90;
    }
    // Camera sensors expose their video stream in landscape by default. Rotate
    // the default camera preview to portrait, while preserving an explicit
    // orientation selected by the user.
    if (camera && params.captureOrientationLock == 0) {
        params.captureOrientation = 90;
    }
    params.stayAwake = !camera && ui->stayAwakeCheck->isChecked();
    params.recordFile = ui->recordScreenCheck->isChecked();
    params.recordPath = ui->recordPathEdt->text().trimmed();
    params.recordFileFormat = ui->formatBox->currentText().trimmed();
    params.serverLocalPath = getServerPath();
    params.serverRemotePath = Config::getInstance().getServerPath();
    params.pushFilePath = Config::getInstance().getPushFilePath();
    params.gameScript = camera ? QString() : getGameScript(ui->gameBox->currentText());
    params.logLevel = Config::getInstance().getLogLevel();
    params.codecOptions = Config::getInstance().getCodecOptions();
    params.codecName = Config::getInstance().getCodecName();
    params.scid = QRandomGenerator::global()->bounded(1, 10000) & 0x7FFFFFFF;
    params.decodeMode = ui->decodeModeBox->currentIndex();
    // Disabled widgets may remain checked from persisted settings. Advanced
    // display options are not valid for camera capture, so never copy them
    // into camera session parameters.
    if (!camera && m_advancedDisplayGroup && m_advancedDisplayGroup->isChecked()) {
        const int displayMode = m_displayModeBox->currentIndex();
        if (displayMode == 1) {
            bool ok = false;
            const int displayId = m_displayIdEdit->text().trimmed().toInt(&ok);
            if (!ok || displayId < 0) {
                outLog(tr("invalid display ID"));
                return;
            }
            params.displayId = displayId;
        } else if (displayMode == 2) {
            params.newDisplay = m_newDisplayEdit->text().trimmed();
            if (params.newDisplay.isEmpty()) {
                // Match scrcpy's flex default (1280x960 at 160 dpi) while
                // keeping the command-line parameter explicit.
                params.newDisplay = "1280x960/160";
            }
            params.flexDisplay = m_flexDisplayCheck->isChecked();
            params.vdSystemDecorations = m_vdSystemDecorationsCheck->isChecked();
            params.vdDestroyContent = m_vdDestroyContentCheck->isChecked();
            params.displayImePolicy = m_displayImePolicyBox->currentData().toString();
        }
        params.keepActive = m_keepActiveCheck->isChecked();
        params.startApp = m_startAppBox->currentData().toString();
        if (params.startApp.isEmpty()) {
            params.startApp = m_startAppBox->currentText().trimmed();
        }
        // scrcpy forbids crop with flex display. Preserve the entered value
        // for a later non-flex session, but never pass it to the server.
        params.crop = params.flexDisplay ? QString() : m_cropEdit->text().trimmed();
    }
    if (params.flexDisplay && (params.newDisplay.isEmpty() || !params.display || !params.crop.isEmpty())) {
        outLog(tr("flex display requires video, a new virtual display, and no crop"));
        return;
    }

    const bool needsVirtualDisplayCheck = !params.newDisplay.isEmpty();
    if (!camera && !needsVirtualDisplayCheck) {
        qsc::IDeviceManage::getInstance().connectDevice(params);
        return;
    }

    auto *versionAdb = new qsc::AdbProcess(this);
    connect(versionAdb, &qsc::AdbProcess::adbProcessResult, this,
            [this, versionAdb, camera, params](qsc::AdbProcess::ADB_EXEC_RESULT result) {
        if (result == qsc::AdbProcess::AER_SUCCESS_EXEC) {
            bool ok = false;
            const int sdk = versionAdb->getStdOut().trimmed().toInt(&ok);
            const int minimumSdk = camera ? 31 : 29;
            if (ok && sdk >= minimumSdk) {
                qsc::IDeviceManage::getInstance().connectDevice(params);
            } else {
                outLog(camera ? tr("camera preview requires Android 12 or later")
                              : tr("virtual display requires Android 10 or later"));
            }
            versionAdb->deleteLater();
        } else if (result == qsc::AdbProcess::AER_ERROR_EXEC
                   || result == qsc::AdbProcess::AER_ERROR_START
                   || result == qsc::AdbProcess::AER_ERROR_MISSING_BINARY) {
            outLog(tr("could not verify Android version for camera preview"));
            versionAdb->deleteLater();
        }
    });
    versionAdb->execute(params.serial, QStringList() << "shell" << "getprop" << "ro.build.version.sdk");
}

void Dialog::on_refreshCameraBtn_clicked()
{
    const QString serial = ui->serialBox->currentText().trimmed();
    if (serial.isEmpty()) {
        outLog(tr("no device"));
        return;
    }
    if (qsc::IDeviceManage::getInstance().getDevice(serial)) {
        outLog(tr("stop preview first"));
        return;
    }

    ui->refreshCameraBtn->setEnabled(false);
    ui->refreshCameraBtn->setText("...");

    auto *pushAdb = new qsc::AdbProcess(this);
    connect(pushAdb, &qsc::AdbProcess::adbProcessResult, this,
            [this, pushAdb, serial](qsc::AdbProcess::ADB_EXEC_RESULT result) {
        if (result == qsc::AdbProcess::AER_SUCCESS_EXEC) {
            pushAdb->deleteLater();

            auto *listAdb = new qsc::AdbProcess(this);
            connect(listAdb, &qsc::AdbProcess::adbProcessResult, this,
                    [this, listAdb](qsc::AdbProcess::ADB_EXEC_RESULT listResult) {
                if (listResult == qsc::AdbProcess::AER_SUCCESS_START) {
                    return;
                }
                ui->refreshCameraBtn->setText(tr("refresh"));
                ui->refreshCameraBtn->setEnabled(ui->videoSourceBox->currentIndex() == qsc::VIDEO_SOURCE_CAMERA);

                if (listResult != qsc::AdbProcess::AER_SUCCESS_EXEC) {
                    outLog(tr("camera refresh failed"));
                    listAdb->deleteLater();
                    return;
                }

                const QString output = listAdb->getStdOut() + '\n' + listAdb->getErrorOut();
                const QRegularExpression pattern(R"(--camera-id=(\S+)\s+\(([^,\)]+))");
                QRegularExpressionMatchIterator matches = pattern.globalMatch(output);

                const int facingIndex = ui->cameraFacingBox->currentIndex();
                ui->cameraFacingBox->clear();
                ui->cameraFacingBox->addItem(tr("back"));
                ui->cameraFacingBox->addItem(tr("front"));

                int cameraCount = 0;
                while (matches.hasNext()) {
                    const QRegularExpressionMatch match = matches.next();
                    const QString cameraId = match.captured(1);
                    const QString facing = match.captured(2).trimmed();
                    ui->cameraFacingBox->addItem(QString("%1 (%2)").arg(cameraId, facing), cameraId);
                    ++cameraCount;
                }

                ui->cameraFacingBox->setCurrentIndex(qMin(facingIndex, ui->cameraFacingBox->count() - 1));
                outLog(cameraCount ? tr("camera refreshed") : tr("no camera"));
                listAdb->deleteLater();
            });

            QStringList args;
            args << "shell";
            args << QString("CLASSPATH=%1").arg(Config::getInstance().getServerPath());
            args << "app_process" << "/" << "com.genymobile.scrcpy.Server" << "4.1";
            args << "list_cameras=true" << "log_level=info";
            listAdb->execute(serial, args);
        } else if (result == qsc::AdbProcess::AER_ERROR_EXEC
                   || result == qsc::AdbProcess::AER_ERROR_START
                   || result == qsc::AdbProcess::AER_ERROR_MISSING_BINARY) {
            ui->refreshCameraBtn->setText(tr("refresh"));
            ui->refreshCameraBtn->setEnabled(ui->videoSourceBox->currentIndex() == qsc::VIDEO_SOURCE_CAMERA);
            outLog(tr("camera refresh failed"));
            pushAdb->deleteLater();
        }
    });
    pushAdb->push(serial, getServerPath(), Config::getInstance().getServerPath());
}

void Dialog::on_refreshAppsBtn_clicked()
{
    const QString serial = ui->serialBox->currentText().trimmed();
    if (serial.isEmpty()) {
        outLog(tr("no device"));
        return;
    }
    if (qsc::IDeviceManage::getInstance().getDevice(serial)) {
        outLog(tr("stop server first"));
        return;
    }

    m_refreshAppsBtn->setEnabled(false);
    m_refreshAppsBtn->setText("...");

    auto restoreRefreshButton = [this]() {
        m_refreshAppsBtn->setText(tr("refresh"));
        m_refreshAppsBtn->setEnabled(ui->videoSourceBox->currentIndex() == qsc::VIDEO_SOURCE_DISPLAY);
    };

    auto *pushAdb = new qsc::AdbProcess(this);
    connect(pushAdb, &qsc::AdbProcess::adbProcessResult, this,
            [this, pushAdb, serial, restoreRefreshButton](qsc::AdbProcess::ADB_EXEC_RESULT result) {
        if (result == qsc::AdbProcess::AER_SUCCESS_EXEC) {
            pushAdb->deleteLater();

            auto *listAdb = new qsc::AdbProcess(this);
            connect(listAdb, &qsc::AdbProcess::adbProcessResult, this,
                    [this, listAdb, restoreRefreshButton](qsc::AdbProcess::ADB_EXEC_RESULT listResult) {
                if (listResult == qsc::AdbProcess::AER_SUCCESS_START) {
                    return;
                }
                restoreRefreshButton();

                if (listResult != qsc::AdbProcess::AER_SUCCESS_EXEC) {
                    outLog(tr("app refresh failed"));
                    listAdb->deleteLater();
                    return;
                }

                const QString selected = m_startAppBox->currentData().toString().isEmpty()
                        ? m_startAppBox->currentText().trimmed()
                        : m_startAppBox->currentData().toString();
                const QString output = listAdb->getStdOut() + '\n' + listAdb->getErrorOut();
                const QRegularExpression pattern(
                        R"(^\s*[\*\-]\s+(.+?)\s+([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\s*$)",
                        QRegularExpression::MultilineOption);
                QRegularExpressionMatchIterator matches = pattern.globalMatch(output);

                m_startAppBox->clear();
                m_startAppBox->addItem(QString(), QString());
                int appCount = 0;
                while (matches.hasNext()) {
                    const QRegularExpressionMatch match = matches.next();
                    const QString name = match.captured(1).trimmed();
                    const QString packageName = match.captured(2);
                    m_startAppBox->addItem(QString("%1 (%2)").arg(name, packageName), packageName);
                    ++appCount;
                }

                const int selectedIndex = m_startAppBox->findData(selected);
                if (selectedIndex >= 0) {
                    m_startAppBox->setCurrentIndex(selectedIndex);
                } else {
                    m_startAppBox->setEditText(selected);
                }
                outLog(appCount ? tr("apps refreshed") : tr("no launchable app"));
                listAdb->deleteLater();
            });

            QStringList args;
            args << "shell";
            args << QString("CLASSPATH=%1").arg(Config::getInstance().getServerPath());
            args << "app_process" << "/" << "com.genymobile.scrcpy.Server" << "4.1";
            args << "list_apps=true" << "log_level=info";
            listAdb->execute(serial, args);
        } else if (result == qsc::AdbProcess::AER_ERROR_EXEC
                   || result == qsc::AdbProcess::AER_ERROR_START
                   || result == qsc::AdbProcess::AER_ERROR_MISSING_BINARY) {
            restoreRefreshButton();
            outLog(tr("app refresh failed"));
            pushAdb->deleteLater();
        }
    });
    pushAdb->push(serial, getServerPath(), Config::getInstance().getServerPath());
}

void Dialog::on_stopServerBtn_clicked()
{
    if (qsc::IDeviceManage::getInstance().disconnectDevice(ui->serialBox->currentText().trimmed())) {
        outLog("stop server");
    }
}

void Dialog::on_wirelessConnectBtn_clicked()
{
    if (m_wirelessDialog) {
        m_wirelessDialog->show();
        m_wirelessDialog->raise();
        m_wirelessDialog->activateWindow();
        return;
    }
    if (!m_wirelessController) {
        m_wirelessController = new WirelessAdbController(wirelessAdbPath(), this);
    }
    if (!m_wirelessSettings) {
        m_wirelessSettings = new QSettings(this);
    }
    m_wirelessDialog = new WirelessPairDialog(m_wirelessController,
                                              m_wirelessSettings,
                                              this);
    m_wirelessDialog->setAttribute(Qt::WA_DeleteOnClose);
    m_moyuWindow->setInteractionSuspended(true);
    connect(m_wirelessDialog, &QDialog::finished, this, [this]() {
        m_moyuWindow->setInteractionSuspended(false);
    });
    connect(m_wirelessDialog, &WirelessPairDialog::connectionSucceeded,
            this, [this]() {
                m_selectSingleWirelessAfterRefresh = true;
                on_updateDevice_clicked();
            });
    m_wirelessDialog->show();
}

void Dialog::outLog(const QString &log, bool newLine)
{
    // avoid sub thread update ui
    QString backLog = log;
    QTimer::singleShot(0, this, [this, backLog, newLine]() {
        ui->outEdit->append(backLog);
        if (newLine) {
            ui->outEdit->append("<br/>");
        }
    });
}

bool Dialog::filterLog(const QString &log)
{
    if (log.contains("app_proces")) {
        return true;
    }
    if (log.contains("Unable to set geometry")) {
        return true;
    }
    return false;
}

bool Dialog::checkAdbRun()
{
    if (m_adb.isRuning()) {
        outLog("wait for the end of the current command to run");
    }
    return m_adb.isRuning();
}

void Dialog::onDeviceConnected(bool success, const QString &serial, const QString &deviceName, const QSize &size)
{
    Q_UNUSED(deviceName);
    if (!success) {
        return;
    }
    auto videoForm = new VideoForm(ui->framelessCheck->isChecked(), Config::getInstance().getSkin(), ui->showToolbar->isChecked(), ui->decodeModeBox->currentIndex());
    videoForm->setSerial(serial);

    qsc::IDeviceManage::getInstance().getDevice(serial)->setUserData(static_cast<void*>(videoForm));
    qsc::IDeviceManage::getInstance().getDevice(serial)->registerDeviceObserver(videoForm);


    videoForm->showFPS(ui->fpsCheck->isChecked());

    if (ui->alwaysTopCheck->isChecked()) {
        videoForm->staysOnTop();
    }

#ifndef Q_OS_WIN32
    // must be show before updateShowSize
    videoForm->show();
#endif
    QString name = Config::getInstance().getNickName(serial);
    if (name.isEmpty()) {
        name = Config::getInstance().getTitle();
    }
    videoForm->setWindowTitle(name + "-" + serial);
    videoForm->updateShowSize(size);
    videoForm->restoreMoyuWindow();
    m_lastVideoForm = videoForm;
    connect(videoForm, &QObject::destroyed, this, [this, videoForm]() {
        if (m_lastVideoForm == videoForm) {
            m_lastVideoForm.clear();
        }
    });

    GroupController::instance().addDevice(serial);
}

void Dialog::onDeviceDisconnected(QString serial)
{
    GroupController::instance().removeDevice(serial);
    auto device = qsc::IDeviceManage::getInstance().getDevice(serial);
    if (!device) {
        return;
    }
    auto data = device->getUserData();
    if (data) {
        VideoForm* vf = static_cast<VideoForm*>(data);
        qsc::IDeviceManage::getInstance().getDevice(serial)->deRegisterDeviceObserver(vf);
        vf->close();
        vf->deleteLater();
    }
}

void Dialog::on_wirelessDisConnectBtn_clicked()
{
    if (checkAdbRun()) {
        return;
    }
    const QString addr = ui->serialBox->currentText().trimmed();
    outLog("wireless disconnect...", false);
    QStringList adbArgs;
    adbArgs << "disconnect";
    if (isWirelessSerial(addr)) {
        adbArgs << addr;
    }
    m_adb.execute("", adbArgs);
}

void Dialog::on_selectRecordPathBtn_clicked()
{
    QFileDialog::Options options = QFileDialog::DontResolveSymlinks | QFileDialog::ShowDirsOnly;
    QString directory = QFileDialog::getExistingDirectory(this, tr("select path"), "", options);
    ui->recordPathEdt->setText(directory);
}

void Dialog::on_recordPathEdt_textChanged(const QString &arg1)
{
    ui->recordPathEdt->setToolTip(arg1.trimmed());
    ui->notDisplayCheck->setCheckable(!arg1.trimmed().isEmpty());
}

void Dialog::on_adbCommandBtn_clicked()
{
    execAdbCmd();
}

void Dialog::on_stopAdbBtn_clicked()
{
    m_adb.kill();
}

void Dialog::on_clearOut_clicked()
{
    ui->outEdit->clear();
}

void Dialog::on_stopAllServerBtn_clicked()
{
    qsc::IDeviceManage::getInstance().disconnectAllDevice();
}

void Dialog::on_refreshGameScriptBtn_clicked()
{
    ui->gameBox->clear();
    QDir dir(getKeyMapPath());
    if (!dir.exists()) {
        outLog("keymap directory not find", true);
        return;
    }
    dir.setFilter(QDir::Files | QDir::NoSymLinks);
    QFileInfoList list = dir.entryInfoList();
    QFileInfo fileInfo;
    int size = list.size();
    for (int i = 0; i < size; ++i) {
        fileInfo = list.at(i);
        ui->gameBox->addItem(fileInfo.fileName());
    }
}

void Dialog::on_applyScriptBtn_clicked()
{
    auto curSerial = ui->serialBox->currentText().trimmed();
    auto device = qsc::IDeviceManage::getInstance().getDevice(curSerial);
    if (!device) {
        return;
    }

    device->updateScript(getGameScript(ui->gameBox->currentText()));
}

void Dialog::on_recordScreenCheck_clicked(bool checked)
{
    if (!checked) {
        return;
    }

    QString fileDir(ui->recordPathEdt->text().trimmed());
    if (fileDir.isEmpty()) {
        qWarning() << "please select record save path!!!";
        ui->recordScreenCheck->setChecked(false);
    }
}

void Dialog::on_connectedPhoneList_itemDoubleClicked(QListWidgetItem *item)
{
    Q_UNUSED(item);
    ui->serialBox->setCurrentIndex(ui->connectedPhoneList->currentRow());
    on_startServerBtn_clicked();
}

void Dialog::on_updateNameBtn_clicked()
{
    if (ui->serialBox->count() != 0) {
        if (ui->userNameEdt->text().isEmpty()) {
            Config::getInstance().setNickName(ui->serialBox->currentText(), "Phone");
        } else {
            Config::getInstance().setNickName(ui->serialBox->currentText(), ui->userNameEdt->text());
        }

        on_updateDevice_clicked();

        qDebug() << "Update OK!";
    } else {
        qWarning() << "No device is connected!";
    }
}

void Dialog::on_useSingleModeCheck_clicked()
{
    if (ui->useSingleModeCheck->isChecked()) {
        ui->rightWidget->hide();
    } else {
        ui->rightWidget->show();
    }

    adjustSize();
}

void Dialog::on_serialBox_currentIndexChanged(const QString &arg1)
{
    ui->userNameEdt->setText(Config::getInstance().getNickName(arg1));
}

quint32 Dialog::getBitRate()
{
    return ui->bitRateEdit->text().trimmed().toUInt() *
            (ui->bitRateBox->currentText() == QString("Mbps") ? 1000000 : 1000);
}

const QString &Dialog::getServerPath()
{
    static QString serverPath;
    if (serverPath.isEmpty()) {
        serverPath = QString::fromLocal8Bit(qgetenv("QTSCRCPY_SERVER_PATH"));
        QFileInfo fileInfo(serverPath);
        if (serverPath.isEmpty() || !fileInfo.isFile()) {
            serverPath = QCoreApplication::applicationDirPath() + "/scrcpy-server";
        }
    }
    return serverPath;
}

void Dialog::on_startAudioBtn_clicked()
{
    if (ui->serialBox->count() == 0) {
        qWarning() << "No device is connected!";
        return;
    }

    m_audioOutput.start(ui->serialBox->currentText(), 28200);
}

void Dialog::on_stopAudioBtn_clicked()
{
    m_audioOutput.stop();
}

void Dialog::on_installSndcpyBtn_clicked()
{
    if (ui->serialBox->count() == 0) {
        qWarning() << "No device is connected!";
        return;
    }
    m_audioOutput.installonly(ui->serialBox->currentText(), 28200);
}

void Dialog::on_autoUpdatecheckBox_toggled(bool checked)
{
    if (checked) {
        m_autoUpdatetimer.start(5000);
    } else {
        m_autoUpdatetimer.stop();
    }
}
