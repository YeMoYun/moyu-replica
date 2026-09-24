// Modified for MoYuMaster: shared native window controls.
#pragma once

#include <QFont>
#include <QWidget>

class QAction;
class QLabel;
class QSlider;
class QToolButton;

class MoyuControlBar : public QWidget
{
    Q_OBJECT

public:
    enum class Role { MainWindow, VideoWindow };
    explicit MoyuControlBar(Role role, QWidget *parent = nullptr);
    int opacityPercent() const;
    bool lightToolbar() const;
    void setOpacityPercent(int percent);
    void setLightToolbar(bool light);
    void setTopmostChecked(bool checked);
    void setAutoHideChecked(bool checked);

signals:
    void closeRequested();
    void topmostToggled(bool enabled);
    void fitRequested();
    void opacityRequested();
    void autoHideToggled(bool enabled);
    void controlRequested();
    void homeRequested();
    void fullscreenRequested();
    void helpRequested();
    void appearanceRequested();
    void collapseRequested();

private:
    QToolButton *addButton(const QString &text,
                           const QString &tooltip,
                           const char *objectName,
                           bool checkable = false,
                           bool useIconFont = false);
    QToolButton *addIconButton(uint iconCode,
                               const QString &fallbackText,
                               const QString &tooltip,
                               const char *objectName,
                               bool checkable = false);
    void applyTheme();

    Role m_role;
    QSlider *m_opacitySlider = nullptr;
    QLabel *m_opacityLabel = nullptr;
    QAction *m_darkAction = nullptr;
    QAction *m_lightAction = nullptr;
    QToolButton *m_topmostButton = nullptr;
    QToolButton *m_autoHideButton = nullptr;
    QFont m_iconFont;
    bool m_iconFontLoaded = false;
    bool m_lightToolbar = false;
};
