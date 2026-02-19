import Container from "@/components/Container";
import Header from "@/components/Header";
import { useUpload } from "@/hooks/use-upload";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Button, Description, Input, Label, TextField } from "heroui-native";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { alert } from "@/lib/alert";

type SelectedFile = {
    id: string;
    uri: string;
    type: "image" | "video" | "document";
    name: string;
    mimeType?: string;
    description?: string;
};

export default function UploadScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const {
        selectedFiles,
        title,
        isUploading,
        handleUpload,
        setTitle,
        setSelectedFiles,
        updateFile,
    } = useUpload();

    const pickImage = async (useCamera = false) => {
        try {
            let result;
            if (useCamera) {
                await ImagePicker.requestCameraPermissionsAsync();
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ["videos", "images"],
                    quality: 0.8,
                });
            } else {
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ["videos", "images"],
                    allowsMultipleSelection: true,
                    quality: 0.8,
                });
            }

            if (!result.canceled) {
                const newFiles = result.assets.map((asset) => ({
                    id: asset.assetId || Math.random().toString(),
                    uri: asset.uri,
                    type: asset.type === "video" ? "video" : "image",
                    name: asset.fileName || `file_${Date.now()}.jpg`,
                    mimeType: asset.mimeType || "image/jpeg",
                }));
                // @ts-ignore
                setSelectedFiles((prev) => [...prev, ...newFiles]);
            }
        } catch (error) {
            alert(
                t("common.error"),
                t("vaultUpload.filePickError", { msg: error.message }),
            );
        }
    };

    const removeFile = (id: string) => {
        setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
    };

    return (
        <Container className="bg-white flex-1">
            <Header
                title={t("vaultUpload.title")}
                onBack={() => router.back()}
            />
            <ScrollView
                className="flex-1 px-4 pt-4"
                contentContainerClassName="pb-10"
                showsVerticalScrollIndicator={false}
            >
                <TextField className="mb-6">
                    <Label className="text-lg font-semibold mb-1">
                        {t("vaultUpload.postTitleLabel")}
                    </Label>
                    <Input
                        placeholder={t("vaultUpload.postTitlePlaceholder")}
                        value={title}
                        onChangeText={setTitle}
                        variant="secondary"
                    />
                </TextField>

                <View className="mb-6">
                    <Label className="text-lg font-semibold mb-3">
                        {t("vaultUpload.mediaLabel")}
                    </Label>

                    {selectedFiles.length === 0 ? (
                        <TouchableOpacity
                            onPress={() => pickImage(false)}
                            className="border-2 border-dashed border-gray-300 rounded-xl h-40 items-center justify-center bg-gray-50 active:bg-gray-100"
                        >
                            <Ionicons
                                name="images-outline"
                                size={40}
                                color="#9CA3AF"
                            />
                            <Description className="mt-2 text-gray-500 font-medium">
                                {t("vaultUpload.pickMedia")}
                            </Description>
                        </TouchableOpacity>
                    ) : (
                        <View className="gap-4">
                            {selectedFiles.map((file, index) => (
                                <View
                                    key={file.id}
                                    className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm"
                                >
                                    <View className="h-48 w-full relative">
                                        <Image
                                            source={{ uri: file.uri }}
                                            style={{
                                                flex: 1,
                                                width: "100%",
                                                height: "100%",
                                            }}
                                            contentFit="cover"
                                        />
                                        <TouchableOpacity
                                            onPress={() => removeFile(file.id)}
                                            className="absolute top-2 right-2 bg-black/50 p-2 rounded-full"
                                        >
                                            <Ionicons
                                                name="close"
                                                size={16}
                                                color="white"
                                            />
                                        </TouchableOpacity>
                                        {file.type === "video" && (
                                            <View className="absolute inset-0 items-center justify-center">
                                                <View className="bg-black/40 p-3 rounded-full">
                                                    <Ionicons
                                                        name="play"
                                                        size={24}
                                                        color="white"
                                                    />
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    <View className="p-3">
                                        <TextField>
                                            <Input
                                                placeholder={t(
                                                    "vaultUpload.descriptionPlaceholder",
                                                )}
                                                value={file.description}
                                                onChangeText={(text) =>
                                                    updateFile(file.id, {
                                                        description: text,
                                                    })
                                                }
                                                variant="secondary"
                                            />
                                        </TextField>
                                    </View>
                                </View>
                            ))}

                            <TouchableOpacity
                                onPress={() => pickImage(false)}
                                className="flex-row items-center justify-center py-4 border border-dashed border-gray-300 rounded-xl bg-gray-50 active:bg-gray-100 mt-2"
                            >
                                <Ionicons
                                    name="add-circle-outline"
                                    size={20}
                                    color="#6B7280"
                                />
                                <Description className="ml-2 text-gray-600 font-medium">
                                    {t("vaultUpload.addMore")}
                                </Description>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>

            <View className="p-4 bg-white border-t border-gray-100">
                <Button
                    onPress={handleUpload}
                    variant="primary"
                    size="lg"
                    isDisabled={isUploading || selectedFiles.length === 0}
                    className="w-full shadow-md shadow-blue-500/20"
                >
                    {isUploading ? (
                        <Button.Label>
                            {t("vaultUpload.uploading")}
                        </Button.Label>
                    ) : (
                        <>
                            <Ionicons
                                name="cloud-upload-outline"
                                size={20}
                                color="white"
                            />
                            <Button.Label className="ml-2">
                                {t("vaultUpload.share")}
                            </Button.Label>
                        </>
                    )}
                </Button>
            </View>
        </Container>
    );
}
