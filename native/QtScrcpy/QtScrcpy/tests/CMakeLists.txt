find_package(Qt5 REQUIRED COMPONENTS Core Widgets Test)

add_executable(moyu_native_tests
    tst_nativeui.cpp
    ../ui/adbresulttranslator.cpp
    ../ui/adbresulttranslator.h
)
set_target_properties(moyu_native_tests PROPERTIES AUTOMOC ON)

target_include_directories(moyu_native_tests PRIVATE ../ui)
target_link_libraries(moyu_native_tests PRIVATE Qt5::Core Qt5::Widgets Qt5::Test)
if(MSVC)
    target_compile_options(moyu_native_tests PRIVATE /utf-8)
endif()
add_test(NAME moyu_native_tests COMMAND moyu_native_tests)
set_tests_properties(moyu_native_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
