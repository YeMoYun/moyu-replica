find_package(Qt5 REQUIRED COMPONENTS Core Network Widgets Test)

add_executable(moyu_native_tests
    tst_nativeui.cpp
    ../ui/adbresulttranslator.cpp
    ../ui/adbresulttranslator.h
    ../ui/wirelessadbcontroller.cpp
    ../ui/wirelessadbcontroller.h
    ../ui/wirelesspairdialog.cpp
    ../ui/wirelesspairdialog.h
    ../ui/moyucontrolbar.cpp
    ../ui/moyucontrolbar.h
    ../ui/moyuwindowcontroller.cpp
    ../ui/moyuwindowcontroller.h
    ../res/res.qrc
)
set_target_properties(moyu_native_tests PROPERTIES AUTOMOC ON AUTORCC ON)

target_include_directories(moyu_native_tests PRIVATE ../ui)
target_link_libraries(moyu_native_tests PRIVATE Qt5::Core Qt5::Network Qt5::Widgets Qt5::Test)
if(MSVC)
    target_compile_options(moyu_native_tests PRIVATE /utf-8)
endif()
add_test(NAME moyu_native_tests COMMAND moyu_native_tests)
set_tests_properties(moyu_native_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
